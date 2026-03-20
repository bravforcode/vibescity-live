import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfigState = vi.hoisted(() => ({
	wsUrl: "",
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getWebSocketUrl: () => runtimeConfigState.wsUrl,
}));

import { socketService } from "../../src/services/socketService";

describe("socketService local dev opt-out", () => {
	beforeEach(() => {
		socketService.disconnect();
		runtimeConfigState.wsUrl = "";
		vi.restoreAllMocks();
	});

	it("skips connection quietly when no websocket url is configured", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

		expect(socketService.connect()).toBe(false);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(infoSpy).not.toHaveBeenCalled();
	});
});
