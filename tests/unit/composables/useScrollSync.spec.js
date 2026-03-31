import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

import { useScrollSync } from "../../../src/composables/useScrollSync";

const createCard = (id, left, width) => ({
	getAttribute: (name) => (name === "data-shop-id" ? String(id) : null),
	offsetLeft: left,
	offsetWidth: width,
	clientWidth: width,
});

describe("useScrollSync", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"ResizeObserver",
			class ResizeObserverMock {
				constructor(callback) {
					this.callback = callback;
				}
				observe() {}
				disconnect() {}
			},
		);
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
			cb();
			return 1;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("uses cached metrics during the hot horizontal scroll path", async () => {
		const cards = [createCard("1", 0, 220), createCard("2", 232, 176)];
		const querySelectorAll = vi.fn(() => cards);
		const container = {
			clientWidth: 320,
			scrollLeft: 0,
			querySelectorAll,
			scrollTo: vi.fn(),
		};
		const activeShopId = ref("1");
		const onScrollDecelerate = vi.fn();
		const onCenteredShopCommit = vi.fn();

		const sync = useScrollSync({
			activeShopId,
			shops: ref([
				{ id: "1", lat: 18.79, lng: 98.98 },
				{ id: "2", lat: 18.8, lng: 98.99 },
			]),
			selectFeedback: vi.fn(),
			mobileCardScrollRef: ref(container),
			onScrollDecelerate,
			onCenteredShopCommit,
			enableInitialCenteredShopCommit: false,
		});

		await nextTick();
		sync.refreshCardMetrics();
		querySelectorAll.mockClear();

		container.scrollLeft = 190;
		sync.handleHorizontalScroll();
		vi.advanceTimersByTime(420);

		expect(querySelectorAll).not.toHaveBeenCalled();
		expect(activeShopId.value).toBe("2");
		expect(onScrollDecelerate).toHaveBeenCalledWith("2");
		expect(onCenteredShopCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				shopId: "2",
				reason: "startup",
			}),
		);
	});

	it("commits the centered startup card when no shop is active yet", async () => {
		const cards = [
			createCard("pha-koeng", 0, 220),
			createCard("7-eleven", 232, 176),
		];
		const container = {
			clientWidth: 320,
			scrollLeft: 0,
			querySelectorAll: vi.fn(() => cards),
			scrollTo: vi.fn(),
		};
		const activeShopId = ref(null);
		const onCenteredShopCommit = vi.fn();

		useScrollSync({
			activeShopId,
			shops: ref([
				{ id: "pha-koeng", name: "Pha Koeng" },
				{ id: "7-eleven", name: "7-Eleven" },
			]),
			selectFeedback: vi.fn(),
			mobileCardScrollRef: ref(container),
			onScrollDecelerate: vi.fn(),
			onCenteredShopCommit,
			enableInitialCenteredShopCommit: true,
		});

		await nextTick();

		expect(activeShopId.value).toBe("pha-koeng");
		expect(onCenteredShopCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				shopId: "pha-koeng",
				reason: "startup",
			}),
		);
	});
});
