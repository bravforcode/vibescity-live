import { ref } from "vue";
import { getWebSocketUrl } from "../lib/runtimeConfig";
import {
	clearRuntimeLaneUnavailable,
	isRuntimeLaneUnavailable,
	markRuntimeLaneUnavailable,
	RUNTIME_LANES,
} from "../lib/runtimeLaneAvailability";
import { isAppDebugLoggingEnabled } from "../utils/debugFlags";

const shouldLogSocketDebug = () =>
	import.meta.env.DEV &&
	(import.meta.env?.VITE_WS_CONFIG_DEBUG === "true" ||
		isAppDebugLoggingEnabled());

class SocketService {
	constructor() {
		this.socket = null;
		this.isConnected = ref(false);
		this.onlineCount = ref(0);
		this.reconnectAttempts = 0;
		this.maxReconnects = 10; // Circuit breaker: stop after 10 attempts
		this.listeners = new Set();
		this.pendingRoomIds = new Set();
		this.shouldReconnect = true;
		this.circuitBreakerTripped = false; // Tracks if we gave up
		this.wsUrl = ""; // Resolved at connect time
		this.hasConnectedOnce = false;
		this.connectedAt = 0;
		this.sessionDisabled = false;
		this.disabledReason = "";
		this._reportedDisabledReason = "";
	}

	reportDisabledReason(reason, detail = "") {
		if (!shouldLogSocketDebug()) return;
		const signature = `${reason}:${detail}`;
		if (this._reportedDisabledReason === signature) return;
		this._reportedDisabledReason = signature;
		const suffix = detail ? ` (${detail})` : "";
		console.info(`🔌 Realtime disabled for this session: ${reason}${suffix}`);
	}

	disableRealtimeForCurrentSession(
		reason = "runtime_unavailable",
		{
			markLaneUnavailable = true,
			closeSocket = true,
			clearPendingRooms = true,
		} = {},
	) {
		if (markLaneUnavailable) {
			markRuntimeLaneUnavailable(RUNTIME_LANES.websocket);
		}
		this.circuitBreakerTripped = true;
		this.shouldReconnect = false;
		this.sessionDisabled = true;
		this.disabledReason = String(reason || "runtime_unavailable");
		if (this._retryTimer) {
			clearTimeout(this._retryTimer);
			this._retryTimer = null;
		}
		if (closeSocket && this.socket) {
			try {
				this.socket.close();
			} catch {
				// ignore
			}
		}
		if (clearPendingRooms) {
			this.pendingRoomIds.clear();
		}
		this.socket = null;
		this.isConnected.value = false;
		this.reportDisabledReason(this.disabledReason);
	}

	/**
	 * Connect to WebSocket - returns boolean indicating success
	 * @returns {boolean} true if connection initiated, false if URL invalid
	 */
	connect() {
		if (this.sessionDisabled) {
			return false;
		}

		// Resolve URL at connect-time (not module load time)
		this.wsUrl = getWebSocketUrl();

		if (!this.wsUrl) {
			this.disableRealtimeForCurrentSession("missing_url", {
				markLaneUnavailable: false,
				closeSocket: false,
			});
			return false;
		}

		if (isRuntimeLaneUnavailable(RUNTIME_LANES.websocket)) {
			this.disableRealtimeForCurrentSession("runtime_lane_unavailable");
			return false;
		}

		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			return true;
		}
		// Avoid duplicate connections while already connecting.
		if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
			return true;
		}

		this.shouldReconnect = true;
		this.circuitBreakerTripped = false;
		this.sessionDisabled = false;
		this.disabledReason = "";
		this._reportedDisabledReason = "";

		try {
			if (shouldLogSocketDebug()) {
				console.log("🔌 Connecting to VibeStream:", this.wsUrl);
			}
			this.socket = new WebSocket(this.wsUrl);
		} catch (err) {
			this.reportDisabledReason("constructor_failed", err?.message || "");
			return false;
		}

		this.socket.onopen = () => {
			if (shouldLogSocketDebug()) console.log("✅ VibeStream Connected");
			this.isConnected.value = true;
			this.reconnectAttempts = 0;
			this.hasConnectedOnce = true;
			this.connectedAt = Date.now();
			this.sessionDisabled = false;
			this.disabledReason = "";
			this._reportedDisabledReason = "";
			clearRuntimeLaneUnavailable(RUNTIME_LANES.websocket);
			// Request current online count from server
			this.sendVibe({ action: "presence:join" });
			if (this.pendingRoomIds.size > 0) {
				for (const shopId of this.pendingRoomIds) {
					this.sendVibe({ action: "subscribe", shopId });
				}
				this.pendingRoomIds.clear();
			}
		};

		this.socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				// Handle global presence updates
				if (data.type === "global_presence" && typeof data.count === "number") {
					this.onlineCount.value = data.count;
				}
				this.notifyListeners(data);
			} catch (e) {
				if (shouldLogSocketDebug())
					console.warn("Non-JSON socket message:", event.data);
				this.notifyListeners({ type: "text", content: event.data });
			}
		};

		this.socket.onclose = () => {
			if (shouldLogSocketDebug()) console.log("❌ VibeStream Disconnected");
			const hadStableConnection =
				this.hasConnectedOnce || this.isConnected.value;
			this.isConnected.value = false;
			if (!hadStableConnection) {
				this.disableRealtimeForCurrentSession("initial_close");
				return;
			}
			if (this.shouldReconnect) {
				this.retryConnection();
			}
		};

		this.socket.onerror = () => {
			if (!this.hasConnectedOnce) {
				this.disableRealtimeForCurrentSession("initial_error");
				return;
			}
			if (shouldLogSocketDebug())
				console.warn("⚠️ VibeStream: Temporary connection drop, will retry...");
		};

		return true;
	}

	retryConnection() {
		if (!this.wsUrl || this.sessionDisabled) return; // Don't retry if disabled

		// Circuit breaker: stop reconnection after max attempts
		if (this.reconnectAttempts >= this.maxReconnects) {
			if (!this.circuitBreakerTripped) {
				this.disableRealtimeForCurrentSession("circuit_breaker");
			}
			return;
		}

		// Exponential backoff with jitter: 2s, 4s, 8s, 16s, 30s (cap) + random ±25%
		const base = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
		const jitter = base * (0.75 + Math.random() * 0.5); // ±25% jitter prevents thundering herd
		const backoff = Math.round(jitter);

		if (this.reconnectAttempts > 0 && shouldLogSocketDebug()) {
			console.log(
				`🔌 Reconnecting in ${(backoff / 1000).toFixed(1)}s (Attempt ${this.reconnectAttempts}/${this.maxReconnects})...`,
			);
		}

		this.reconnectAttempts++;
		this._retryTimer = setTimeout(() => {
			this._retryTimer = null;
			// Defer reconnect if tab is hidden — reconnect when visible
			if (typeof document !== "undefined" && document.hidden) {
				const onVisible = () => {
					document.removeEventListener("visibilitychange", onVisible);
					if (this.shouldReconnect) this.connect();
				};
				document.addEventListener("visibilitychange", onVisible, {
					once: true,
				});
				return;
			}
			if (this.shouldReconnect) this.connect();
		}, backoff);
	}

	sendVibe(message) {
		// Optional realtime: silently skip when disabled or not configured.
		if (this.sessionDisabled || !this.wsUrl) return;

		// If message is object, stringify
		const payload =
			typeof message === "object" ? JSON.stringify(message) : message;
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(payload);
		} else {
			// Only warn if we have a URL but socket isn't ready
			if (shouldLogSocketDebug())
				console.warn("Socket not open, cannot send vibe");
		}
	}

	joinRoom(shopId) {
		if (!shopId) return;
		const normalizedShopId = String(shopId);
		if (this.sessionDisabled) return;
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.sendVibe({ action: "subscribe", shopId: normalizedShopId });
		} else {
			this.pendingRoomIds.add(normalizedShopId);
			if (!this.connect()) {
				this.pendingRoomIds.delete(normalizedShopId);
				return;
			}
		}
		if (shouldLogSocketDebug()) console.log(`🔌 Joined Room: ${shopId}`);
	}

	addListener(callback) {
		this.listeners.add(callback);
	}

	removeListener(callback) {
		this.listeners.delete(callback);
	}

	disconnect() {
		this.shouldReconnect = false;
		if (this._retryTimer) {
			clearTimeout(this._retryTimer);
			this._retryTimer = null;
		}
		if (!this.socket) return;
		try {
			this.socket.close();
		} catch {
			// ignore
		}
		this.socket = null;
		this.isConnected.value = false;
	}

	notifyListeners(data) {
		this.listeners.forEach((cb) => {
			cb(data);
		});
	}

	/**
	 * Get current connection status for debugging
	 */
	getStatus() {
		return {
			configured: Boolean(this.wsUrl),
			connected: this.isConnected.value,
			disabledForSession: this.sessionDisabled,
			disabledReason: this.disabledReason,
			reconnectAttempts: this.reconnectAttempts,
			circuitBreakerTripped:
				this.circuitBreakerTripped ||
				isRuntimeLaneUnavailable(RUNTIME_LANES.websocket),
		};
	}
}

export const socketService = new SocketService();
