import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import MallDrawer from "../../../src/components/modal/MallDrawer.vue";
import i18n from "../../../src/i18n.js";

vi.mock("@/composables/engine/useChromaticGlass.js", () => ({
	useChromaticGlass: () => ({
		enabled: false,
		fallbackClass: "",
	}),
}));

vi.mock("@/composables/engine/useGranularAudio.js", () => ({
	useGranularAudio: () => ({
		onSnap: vi.fn(),
		onDismiss: vi.fn(),
	}),
}));

vi.mock("@/composables/useNotifications", () => ({
	useNotifications: () => ({
		notifySuccess: vi.fn(),
	}),
}));

vi.mock("@/composables/usePerformance", () => ({
	usePerformance: () => ({
		isDegraded: ref(false),
	}),
}));

vi.mock("@/composables/useSpatialFeedback", () => ({
	useSpatialFeedback: () => ({
		playWoosh: vi.fn(),
		playSnap: vi.fn(),
		playDismiss: vi.fn(),
		haptic: vi.fn(),
	}),
}));

vi.mock("@/composables/useSwipeToDismiss", () => ({
	useSwipeToDismiss: () => ({
		elementRef: ref(null),
		pullY: ref(0),
		isDragging: ref(false),
	}),
}));

afterEach(() => {
	document.body.innerHTML = "";
});

describe("MallDrawer", () => {
	it("uses the giant shell without rendering mall controls, and restores focus on close", async () => {
		const opener = document.createElement("button");
		opener.textContent = "open";
		document.body.appendChild(opener);
		opener.focus();

		const wrapper = mount(MallDrawer, {
			props: {
				isOpen: true,
				building: {
					id: "mall-1",
					name: "Mega Mall",
				},
				drawerContext: {
					contextId: "giant-pin:map:mall-1:shop-1",
					mode: "giant-pin",
					buildingId: "mall-1",
					buildingName: "Mega Mall",
				},
				shops: [],
			},
			attachTo: document.body,
			global: {
				plugins: [i18n],
				stubs: {
					MallDrawerGiantContent: {
						template: '<div data-testid="giant-stub">giant</div>',
					},
				},
			},
		});

		await nextTick();
		expect(wrapper.find('[data-testid="giant-stub"]').exists()).toBe(true);
		expect(wrapper.text()).not.toContain("Hot Highlights");
		expect(wrapper.text()).not.toContain("Select Floor");
		expect(wrapper.find('input[aria-label="Search venues"]').exists()).toBe(
			false,
		);
		expect(document.activeElement?.getAttribute("aria-label")).toBe(
			"Close mall drawer",
		);

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(wrapper.emitted("close")).toHaveLength(1);

		await wrapper.setProps({ isOpen: false });
		await nextTick();
		await nextTick();
		expect(document.activeElement).toBe(opener);

		wrapper.unmount();
	});

	it("keeps the regular mall drawer flow intact", async () => {
		const wrapper = mount(MallDrawer, {
			props: {
				isOpen: true,
				building: {
					id: "mall-2",
					name: "Central Plaza",
					openTime: "00:00",
					closeTime: "23:59",
					floors: ["G", "1"],
					floorNames: {
						G: "Ground",
					},
					highlights: ["Cinema", "Food Hall"],
				},
				drawerContext: {
					contextId: "mall:map:mall-2:none",
					mode: "mall",
					buildingId: "mall-2",
					buildingName: "Central Plaza",
				},
				shops: [],
			},
			global: {
				plugins: [i18n],
			},
		});

		expect(wrapper.text()).toContain("Hot Highlights");
		expect(wrapper.text()).toContain("Select Floor");
		expect(wrapper.text()).toContain("OPEN NOW");

		await wrapper.get('button[aria-label="Expand search"]').trigger("click");
		expect(
			wrapper
				.get('input[aria-label="Search venues"]')
				.attributes("placeholder"),
		).toBe("Search shops in mall…");
	});
});
