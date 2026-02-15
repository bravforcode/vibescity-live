import { ref } from "vue";
import { getWebSocketUrl } from "../lib/runtimeConfig";

class SocketService {
	constructor() {
		this.socket = null;
		this.isConnected = ref(false);
		this.onlineCount = ref(0);
		this.reconnectAttempts = 0;
		this.maxReconnects = 10; // Circuit breaker: stop after 10 attempts
		this.listeners = new Set();
		this.shouldReconnect = true;
		this.circuitBreakerTripped = false; // Tracks if we gave up
		this.wsUrl = ""; // Resolved at connect time
	}

	/**
	 * Connect to WebSocket - returns boolean indicating success
	 * @returns {boolean} true if connection initiated, false if URL invalid
	 */
	connect() {
		// Resolve URL at connect-time (not module load time)
		this.wsUrl = getWebSocketUrl();

		if (!this.wsUrl) {
			if (import.meta.env.DEV) {
				console.warn("🔌 Socket URL not configured, realtime vibes disabled.");
			}
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

		try {
			if (import.meta.env.DEV) {
				console.log("🔌 Connecting to VibeStream:", this.wsUrl);
			}
			this.socket = new WebSocket(this.wsUrl);
		} catch (err) {
			console.warn("🔌 WebSocket construction failed:", err.message);
			return false;
		}

		this.socket.onopen = () => {
			if (import.meta.env.DEV) console.log("✅ VibeStream Connected");
			this.isConnected.value = true;
			this.reconnectAttempts = 0;
			// Request current online count from server
			this.sendVibe({ action: "presence:join" });
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
				if (import.meta.env.DEV)
					console.warn("Non-JSON socket message:", event.data);
				this.notifyListeners({ type: "text", content: event.data });
			}
		};

		this.socket.onclose = () => {
			if (import.meta.env.DEV) console.log("❌ VibeStream Disconnected");
			this.isConnected.value = false;
			if (this.shouldReconnect) {
				this.retryConnection();
			}
		};

		this.socket.onerror = (err) => {
			if (import.meta.env.DEV) console.error("⚠️ VibeStream Error:", err);
		};

		return true;
	}

	retryConnection() {
		if (!this.wsUrl) return; // Don't retry if no valid URL

		// Circuit breaker: stop reconnection after max attempts
		if (this.reconnectAttempts >= this.maxReconnects) {
			if (!this.circuitBreakerTripped) {
				console.warn(
					"🔌 VibeStream: Circuit breaker tripped - realtime disabled after",
					this.maxReconnects,
					"failures",
				);
				this.circuitBreakerTripped = true;
				this.shouldReconnect = false;
			}
			return;
		}

		// Exponential backoff: 2s, 4s, 8s, 16s, 30s (cap)
		const backoff = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);

		if (this.reconnectAttempts > 0 && import.meta.env.DEV) {
			console.log(
				`🔌 Reconnecting in ${backoff / 1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnects})...`,
			);
		}

		this.reconnectAttempts++;
		setTimeout(() => {
			if (this.shouldReconnect) this.connect();
		}, backoff);
	}

	sendVibe(message) {
		// If no WebSocket URL configured, silently skip
		if (!this.wsUrl) return;

		// If message is object, stringify
		const payload =
			typeof message === "object" ? JSON.stringify(message) : message;
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(payload);
		} else {
			// Only warn if we have a URL but socket isn't ready
			if (import.meta.env.DEV)
				console.warn("Socket not open, cannot send vibe");
		}
	}

	joinRoom(shopId) {
		if (!shopId) return;
		this.sendVibe({ action: "subscribe", shopId: shopId });
		if (import.meta.env.DEV) console.log(`🔌 Joined Room: ${shopId}`);
	}

	addListener(callback) {
		this.listeners.add(callback);
	}

	removeListener(callback) {
		this.listeners.delete(callback);
	}

	disconnect() {
		if (!this.socket) return;
		this.shouldReconnect = false;
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
			reconnectAttempts: this.reconnectAttempts,
		};
	}
}

export const socketService = new SocketService();
