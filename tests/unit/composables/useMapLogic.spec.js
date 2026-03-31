import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useMapLogic } from "../../../src/composables/useMapLogic";

describe("useMapLogic.handleLocateMe", () => {
	it("prefers the dedicated locateUser camera path when exposed by the map", () => {
		const logic = useMapLogic({
			isMobileView: ref(true),
			isTabletView: ref(false),
			isDesktopView: ref(false),
			bottomUiHeight: ref(240),
			userLocation: ref([13.7563, 100.5018]),
		});
		const selectFeedback = vi.fn();
		const locateUser = vi.fn();
		const focusLocation = vi.fn();

		logic.mapRef.value = {
			locateUser,
			focusLocation,
		};

		logic.handleLocateMe(selectFeedback);

		expect(selectFeedback).toHaveBeenCalledTimes(1);
		expect(locateUser).toHaveBeenCalledWith([100.5018, 13.7563], 17, 0, {
			refine: false,
		});
		expect(focusLocation).not.toHaveBeenCalled();
	});

	it("passes locate camera options through focusLocation when locateUser is unavailable", () => {
		const logic = useMapLogic({
			isMobileView: ref(true),
			isTabletView: ref(false),
			isDesktopView: ref(false),
			bottomUiHeight: ref(240),
			userLocation: ref([13.7563, 100.5018]),
		});
		const focusLocation = vi.fn();

		logic.mapRef.value = {
			focusLocation,
		};

		logic.handleLocateMe(null, {
			coords: [13.7569, 100.5024],
			refine: true,
		});

		expect(focusLocation).toHaveBeenCalledWith(
			[100.5024, 13.7569],
			17,
			60,
			0,
			expect.objectContaining({
				cameraMode: "locate",
				duration: 900,
			}),
		);
	});
});
