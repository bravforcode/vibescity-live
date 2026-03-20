import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentTimeRef;
let processedShopsRef;
const { getAllEvents } = vi.hoisted(() => ({
	getAllEvents: vi.fn(),
}));

vi.mock("pinia", () => ({
	storeToRefs: () => ({
		currentTime: currentTimeRef,
		processedShops: processedShopsRef,
	}),
}));

vi.mock("../../src/store/shopStore", () => ({
	useShopStore: () => ({}),
}));

vi.mock("../../src/services/eventService", () => ({
	getAllEvents,
}));

import { useEventLogic } from "../../src/composables/useEventLogic";

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("useEventLogic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentTimeRef = ref(new Date("2026-03-18T00:00:00.000Z"));
		processedShopsRef = ref([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps previous events when sync fails transiently", async () => {
		getAllEvents
			.mockResolvedValueOnce([{ id: "event-1", name: "Initial event" }])
			.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const { eventSyncError, isSyncingEvents, realTimeEvents, updateEventsData } =
			useEventLogic();

		await updateEventsData();
		expect(realTimeEvents.value).toEqual([
			{ id: "event-1", name: "Initial event" },
		]);
		expect(eventSyncError.value).toBeNull();

		await updateEventsData();
		expect(realTimeEvents.value).toEqual([
			{ id: "event-1", name: "Initial event" },
		]);
		expect(eventSyncError.value).toBeNull();
		expect(isSyncingEvents.value).toBe(false);
	});

	it("ignores stale event sync results after a newer sync completes", async () => {
		let resolveFirst;
		getAllEvents
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce([{ id: "event-2", name: "Fresh event" }]);

		const { realTimeEvents, updateEventsData } = useEventLogic();

		const firstSync = updateEventsData();
		await flushPromises();
		await updateEventsData();
		expect(realTimeEvents.value).toEqual([
			{ id: "event-2", name: "Fresh event" },
		]);

		resolveFirst([{ id: "event-1", name: "Stale event" }]);
		await firstSync;
		expect(realTimeEvents.value).toEqual([
			{ id: "event-2", name: "Fresh event" },
		]);
	});
});
