import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useBlurUpImage } from "../../../src/composables/useBlurUpImage";

class MockImage {
	constructor() {
		this.onload = null;
		this.onerror = null;
		this._src = "";
	}

	set src(value) {
		this._src = value;
	}

	get src() {
		return this._src;
	}
}

describe("useBlurUpImage", () => {
	const mountHarness = (source, options) => {
		let composableState;
		const Harness = defineComponent({
			setup() {
				composableState = useBlurUpImage(source, options);
				return () => null;
			},
		});
		const wrapper = mount(Harness);
		return { wrapper, composableState };
	};

	beforeEach(() => {
		vi.stubGlobal("Image", MockImage);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps Supabase storage URLs on the canonical object path", () => {
		const source = ref(
			"https://rukyitpjfmzhqjlfmbie.supabase.co/storage/v1/object/public/venue-media/images/example.png",
		);

		const { wrapper, composableState } = mountHarness(source, { thumbWidth: 24 });

		expect(composableState.thumbUrl.value).toBe(null);
		expect(composableState.imgSrc.value).toBe(source.value);
		wrapper.unmount();
	});

	it("still generates low-quality placeholders for Cloudinary sources", () => {
		const source = ref(
			"https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
		);

		const { wrapper, composableState } = mountHarness(source, { thumbWidth: 24 });

		expect(composableState.thumbUrl.value).toBe(
			"https://res.cloudinary.com/demo/image/upload/w_24,q_10,f_auto/v1/sample.jpg",
		);
		wrapper.unmount();
	});
});
