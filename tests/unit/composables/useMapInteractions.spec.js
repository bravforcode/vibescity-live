import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useMapInteractions } from "../../../src/composables/map/useMapInteractions";

const { impactFeedback, triggerParticleBurst } = vi.hoisted(() => ({
	impactFeedback: vi.fn(),
	triggerParticleBurst: vi.fn(),
}));

vi.mock("../../../src/composables/useHaptics", () => ({
	useHaptics: () => ({
		impactFeedback,
	}),
}));

vi.mock("../../../src/utils/particleEffects", () => ({
	triggerParticleBurst,
}));

const createFeature = (properties = {}, coordinates = [100.5, 13.75]) => ({
	type: "Feature",
	geometry: {
		type: "Point",
		coordinates,
	},
	properties: {
		id: "venue-1",
		name: "Venue",
		pin_type: "normal",
		...properties,
	},
});

const createClickEvent = (feature) => ({
	features: [feature],
	point: { x: 120, y: 240 },
});

describe("useMapInteractions.handlePointClick", () => {
	beforeEach(() => {
		impactFeedback.mockReset();
		triggerParticleBurst.mockReset();
	});

	it("selects regular pins", () => {
		const emit = vi.fn();
		const interactions = useMapInteractions(
			ref(null),
			ref(true),
			emit,
			{},
			ref({
				getBoundingClientRect: () => ({ left: 0, top: 0 }),
			}),
			{ enableTapRipple: false },
		);

		interactions.handlePointClick(
			createClickEvent(
				createFeature({
					id: "venue-regular",
					pin_type: "normal",
				}),
			),
		);

		expect(emit).toHaveBeenCalledWith(
			"select-shop",
			expect.objectContaining({
				id: "venue-regular",
				pin_type: "normal",
				lat: 13.75,
				lng: 100.5,
			}),
		);
		expect(emit).not.toHaveBeenCalledWith("open-building", expect.anything());
	});

	it("opens building flow for giant pins in the production symbol-layer path", () => {
		const emit = vi.fn();
		const interactions = useMapInteractions(
			ref(null),
			ref(true),
			emit,
			{},
			ref({
				getBoundingClientRect: () => ({ left: 0, top: 0 }),
			}),
			{ enableTapRipple: false },
		);

		interactions.handlePointClick(
			createClickEvent(
				createFeature({
					id: "venue-giant",
					pin_type: "giant",
					is_event: "true",
				}),
			),
		);

		expect(emit).toHaveBeenCalledWith(
			"open-building",
			expect.objectContaining({
				id: "venue-giant",
				pin_type: "giant",
				lat: 13.75,
				lng: 100.5,
			}),
		);
		expect(emit).not.toHaveBeenCalledWith("select-shop", expect.anything());
	});

	it("drills down aggregate giant pins instead of selecting phantom venue rows", () => {
		const emit = vi.fn();
		const onAggregateTap = vi.fn();
		const feature = createFeature({
			id: "province:bangkok",
			name: "Bangkok",
			pin_type: "giant",
			aggregate_level: "province",
		});
		const interactions = useMapInteractions(
			ref(null),
			ref(true),
			emit,
			{},
			ref({
				getBoundingClientRect: () => ({ left: 0, top: 0 }),
			}),
			{
				enableTapRipple: false,
				onAggregateTap,
			},
		);

		interactions.handlePointClick(createClickEvent(feature));

		expect(onAggregateTap).toHaveBeenCalledWith(
			feature,
			expect.objectContaining({
				id: "province:bangkok",
				aggregate_level: "province",
			}),
		);
		expect(emit).not.toHaveBeenCalledWith("select-shop", expect.anything());
		expect(emit).not.toHaveBeenCalledWith("open-building", expect.anything());
	});
});

describe("useMapInteractions.focusLocation", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("accepts legacy [lat, lng] input and flies with [lng, lat]", () => {
		const flyTo = vi.fn();
		const interactions = useMapInteractions(
			ref({ flyTo }),
			ref(true),
			vi.fn(),
			{
				uiTopOffset: 64,
				uiBottomOffset: 120,
				isSidebarOpen: false,
			},
			ref(null),
			{ enableTapRipple: false },
		);

		interactions.focusLocation([13.7563, 100.5018], 17, 60);

		expect(flyTo).toHaveBeenCalledWith(
			expect.objectContaining({
				center: [100.5018, 13.7563],
				zoom: 17,
			}),
		);
	});

	it("drops invalid focus coordinates without calling flyTo", () => {
		const flyTo = vi.fn();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const interactions = useMapInteractions(
			ref({ flyTo }),
			ref(true),
			vi.fn(),
			{
				uiTopOffset: 64,
				uiBottomOffset: 120,
				isSidebarOpen: false,
			},
			ref(null),
			{ enableTapRipple: false },
		);

		interactions.focusLocation([300, 400], 17, 60);

		expect(flyTo).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			"Invalid coordinates for focusLocation:",
			[300, 400],
		);
	});

	it("uses easeTo for locate camera mode and stops in-flight motion first", () => {
		const flyTo = vi.fn();
		const easeTo = vi.fn();
		const stop = vi.fn();
		const interactions = useMapInteractions(
			ref({ flyTo, easeTo, stop }),
			ref(true),
			vi.fn(),
			{
				uiTopOffset: 64,
				uiBottomOffset: 120,
				isSidebarOpen: false,
			},
			ref(null),
			{ enableTapRipple: false },
		);

		interactions.focusLocation([100.5018, 13.7563], 17, 60, 0, {
			cameraMode: "locate",
			duration: 900,
		});

		expect(stop).toHaveBeenCalledTimes(1);
		expect(easeTo).toHaveBeenCalledWith(
			expect.objectContaining({
				center: [100.5018, 13.7563],
				zoom: 17,
				duration: 900,
			}),
		);
		expect(flyTo).not.toHaveBeenCalled();
	});
});
