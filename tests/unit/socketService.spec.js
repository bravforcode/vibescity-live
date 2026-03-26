import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeLaneMocks = vi.hoisted(() => ({
	isRuntimeLaneUnavailable: vi.fn(() => false),
	markRuntimeLaneUnavailable: vi.fn(),
	clearRuntimeLaneUnavailable: vi.fn(),
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getWebSocketUrl: () => "wss://vibes.test/ws",
}));

vi.mock("../../src/lib/runtimeLaneAvailability", () => ({
	RUNTIME_LANES: {
		visitorBootstrap: "visitor-bootstrap",
		directionsProxy: "directions-proxy",
		websocket: "websocket",
	},
	isRuntimeLaneUnavailable: runtimeLaneMocks.isRuntimeLaneUnavailable,
	markRuntimeLaneUnavailable: runtimeLaneMocks.markRuntimeLaneUnavailable,
	clearRuntimeLaneUnavailable: runtimeLaneMocks.clearRuntimeLaneUnavailable,
}));

import { socketService } from "../../src/services/socketService";

describe("socketService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		socketService.disconnect();
		socketService.listeners.clear();
		socketService.pendingRoomIds.clear();
		socketService.reconnectAttempts = 0;
		socketService.circuitBreakerTripped = false;
		socketService.shouldReconnect = true;
		socketService.hasConnectedOnce = false;
		socketService.connectedAt = 0;
		socketService.wsUrl = "";
	});

	it("skips opening a websocket when the runtime cooldown is active", () => {
		runtimeLaneMocks.isRuntimeLaneUnavailable.mockReturnValue(true);
		const WebSocketMock = vi.fn();
		WebSocketMock.OPEN = 1;
		WebSocketMock.CONNECTING = 0;
		WebSocketMock.CLOSED = 3;
		vi.stubGlobal("WebSocket", WebSocketMock);

		expect(socketService.connect()).toBe(false);
		expect(WebSocketMock).not.toHaveBeenCalled();
		expect(socketService.circuitBreakerTripped).toBe(true);
	});

	it("disables reconnect spam for the current session after the first failed handshake", () => {
		runtimeLaneMocks.isRuntimeLaneUnavailable.mockReturnValue(false);
		let socketInstance = null;
		const WebSocketMock = vi.fn().mockImplementation(function mockSocket(url) {
			this.url = url;
			this.readyState = 0;
			this.close = vi.fn(() => {
				this.readyState = 3;
			});
			socketInstance = this;
		});
		WebSocketMock.OPEN = 1;
		WebSocketMock.CONNECTING = 0;
		WebSocketMock.CLOSED = 3;
		vi.stubGlobal("WebSocket", WebSocketMock);

		expect(socketService.connect()).toBe(true);
		expect(socketInstance).toBeTruthy();

		socketInstance.onerror();

		expect(runtimeLaneMocks.markRuntimeLaneUnavailable).toHaveBeenCalledWith(
			"websocket",
		);
		expect(socketInstance.close).toHaveBeenCalledTimes(1);
		expect(socketService.shouldReconnect).toBe(false);
		expect(socketService.circuitBreakerTripped).toBe(true);
		expect(socketService.isConnected.value).toBe(false);
	});
});
