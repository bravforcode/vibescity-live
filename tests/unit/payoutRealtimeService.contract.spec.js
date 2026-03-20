import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test/v1",
}));
vi.mock("../../src/services/visitorIdentity", () => ({
	getVisitorToken: () => "token-abc",
}));

import { subscribePayoutEvents } from "../../src/services/payoutRealtimeService";

class EventSourceMock {
	constructor(url) {
		this.url = url;
		this.listeners = new Map();
		this.closed = false;
		EventSourceMock.instances.push(this);
	}

	addEventListener(name, handler) {
		const list = this.listeners.get(name) || [];
		list.push(handler);
		this.listeners.set(name, list);
	}

	emit(name, data) {
		const list = this.listeners.get(name) || [];
		for (const handler of list) {
			handler(data);
		}
	}

	close() {
		this.closed = true;
	}
}

EventSourceMock.instances = [];

describe("payoutRealtimeService contract", () => {
	afterEach(() => {
		EventSourceMock.instances = [];
		vi.unstubAllGlobals();
	});

	it("accepts v1 payout event payload", () => {
		vi.stubGlobal("EventSource", EventSourceMock);

		const onEvent = vi.fn();
		const onError = vi.fn();

		const unsubscribe = subscribePayoutEvents({
			visitorId: "visitor-1",
			onEvent,
			onError,
		});

		const source = EventSourceMock.instances[0];
		expect(source.url).toContain("visitor_id=visitor-1");
		expect(source.url).toContain("visitor_token=token-abc");
		source.emit("message", {
			data: JSON.stringify({
				_version: 1,
				type: "payout.pending",
				payoutId: "abc",
				amount: 99,
				timestamp: "2026-03-06T00:00:00Z",
			}),
		});

		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		unsubscribe();
		expect(source.closed).toBe(true);
	});

	it("reports unsupported event version without throwing", () => {
		vi.stubGlobal("EventSource", EventSourceMock);

		const onEvent = vi.fn();
		const onError = vi.fn();

		subscribePayoutEvents({
			visitorId: "visitor-1",
			onEvent,
			onError,
		});

		const source = EventSourceMock.instances[0];
		source.emit("message", {
			data: JSON.stringify({
				_version: 2,
				type: "payout.pending",
				timestamp: "2026-03-06T00:00:00Z",
			}),
		});

		expect(onEvent).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
