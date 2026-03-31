import { describe, expect, it, vi } from "vitest";
import {
	persistAutoOpenedDetailShopIds,
	restoreAutoOpenedDetailShopIds,
	shouldAutoOpenDetailAfterFlight,
} from "../../../src/composables/useAppLogic";

describe("useAppLogic auto-open detail helpers", () => {
	it("only auto-opens settled preview flights from carousel/startup that have not opened before", () => {
		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "carousel",
				surface: "preview",
				openedShopIds: new Set(),
			}),
		).toBe(true);

		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "startup",
				surface: "preview",
				openedShopIds: new Set(["shop-1"]),
			}),
		).toBe(false);

		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "sentient",
				surface: "preview",
				openedShopIds: new Set(),
			}),
		).toBe(true);

		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "sentient",
				surface: "preview",
				selectedShopId: "shop-1",
				openedShopIds: new Set(["shop-1"]),
			}),
		).toBe(false);

		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "marker",
				surface: "preview",
				openedShopIds: new Set(),
			}),
		).toBe(false);

		expect(
			shouldAutoOpenDetailAfterFlight({
				shopId: "shop-1",
				source: "carousel",
				surface: "detail",
				openedShopIds: new Set(),
			}),
		).toBe(false);
	});

	it("persists and restores auto-opened venue ids in session storage", () => {
		const storage = {
			getItem: vi.fn(),
			setItem: vi.fn(),
		};
		const ids = new Set(["shop-1", "shop-2"]);

		persistAutoOpenedDetailShopIds(storage, ids);

		expect(storage.setItem).toHaveBeenCalledWith(
			"vibecity.autoOpenedDetailShopIds",
			JSON.stringify(["shop-1", "shop-2"]),
		);

		storage.getItem.mockReturnValueOnce(JSON.stringify(["shop-2", "shop-3"]));

		expect([...restoreAutoOpenedDetailShopIds(storage)]).toEqual([
			"shop-2",
			"shop-3",
		]);
	});
});
