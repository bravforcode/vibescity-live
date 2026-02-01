import { ref } from "vue";

const WS_URL = import.meta.env.VITE_WS_URL || ""; // Default empty to prevent auto-connect to localhost in prod/dev without backend


class SocketService {
	constructor() {
		this.socket = null;
		this.isConnected = ref(false);
		this.reconnectAttempts = 0;
		this.maxReconnects = 5;
		this.listeners = new Set();
	}

	connect() {
		if (!WS_URL) {
            // console.warn("Socket URL not configured, skipping realtime vibes.");
            return;
        }
		if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

		console.log("🔌 Connecting to VibeStream:", WS_URL);
		this.socket = new WebSocket(WS_URL);

		this.socket.onopen = () => {
			console.log("✅ VibeStream Connected");
			this.isConnected.value = true;
			this.reconnectAttempts = 0;
		};

		this.socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				this.notifyListeners(data);
			} catch (e) {
				console.warn("Non-JSON socket message:", event.data);
				this.notifyListeners({ type: "text", content: event.data });
			}
		};

		this.socket.onclose = () => {
			console.log("❌ VibeStream Disconnected");
			this.isConnected.value = false;
			this.retryConnection();
		};

		this.socket.onerror = (err) => {
			console.error("⚠️ VibeStream Error:", err);
		};
	}

	retryConnection() {
		if (this.reconnectAttempts >= this.maxReconnects) {
			console.warn("🛑 Max reconnect attempts reached");
			return;
		}
		this.reconnectAttempts++;
		const timeout = Math.min(1000 * this.reconnectAttempts, 5000);
		setTimeout(() => this.connect(), timeout);
	}

	sendVibe(message) {
		// If message is object, stringify
		const payload =
			typeof message === "object" ? JSON.stringify(message) : message;
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(payload);
		} else {
			console.warn("Socket not open, cannot send vibe");
		}
	}

	joinRoom(shopId) {
		if (!shopId) return;
		this.sendVibe({ action: "subscribe", shopId: shopId });
		console.log(`🔌 Joined Room: ${shopId}`);
	}

	addListener(callback) {
		this.listeners.add(callback);
	}

	removeListener(callback) {
		this.listeners.delete(callback);
	}

	notifyListeners(data) {
		this.listeners.forEach((cb) => {
			cb(data);
		});
	}
}

export const socketService = new SocketService();
