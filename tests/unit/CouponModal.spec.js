import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	claimCoupon: vi.fn(),
	notifySuccess: vi.fn(),
	notifyError: vi.fn(),
	userStore: {
		profile: {
			totalCoins: 100,
		},
	},
}));

vi.mock("../../src/services/redemptionService", () => ({
	redemptionService: {
		claimCoupon: (...args) => mockState.claimCoupon(...args),
	},
}));

vi.mock("../../src/store/userStore", () => ({
	useUserStore: () => mockState.userStore,
}));

vi.mock("../../src/composables/useNotifications", () => ({
	useNotifications: () => ({
		notify: ({ type, message }) => {
			if (type === "error") {
				mockState.notifyError(message);
			}
		},
		notifySuccess: (...args) => mockState.notifySuccess(...args),
		notifyError: (...args) => mockState.notifyError(...args),
	}),
}));

import CouponModal from "../../src/components/ui/CouponModal.vue";

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("CouponModal", () => {
	beforeEach(() => {
		mockState.claimCoupon.mockReset();
		mockState.notifySuccess.mockReset();
		mockState.notifyError.mockReset();
		mockState.userStore.profile.totalCoins = 100;
	});

	it("rolls optimistic coin deduction back when coupon claim fails", async () => {
		let rejectClaim;
		mockState.claimCoupon.mockImplementation(
			() =>
				new Promise((_, reject) => {
					rejectClaim = reject;
				}),
		);

		const wrapper = mount(CouponModal, {
			props: {
				isOpen: true,
				couponId: 7,
				couponName: "VIP Coupon",
				cost: 30,
			},
			global: {
				mocks: {
					$t: (key) => key,
				},
			},
		});

		const claimTrigger = wrapper.findAll("button")[0].trigger("click");
		await flushPromises();

		expect(mockState.userStore.profile.totalCoins).toBe(70);

		rejectClaim(new Error("Claim failed"));
		await flushPromises();
		await claimTrigger;

		expect(mockState.userStore.profile.totalCoins).toBe(100);
		expect(mockState.notifyError).toHaveBeenCalledWith("Claim failed");
	});
});
