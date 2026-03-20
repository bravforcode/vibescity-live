import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	limit: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: () => ({
			select: () => ({
				limit: (...args) => mockState.limit(...args),
			}),
		}),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

import { useFeatureFlagStore } from "../../src/store/featureFlagStore";

describe("featureFlagStore neon rollout", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.limit.mockReset();
		mockState.limit.mockResolvedValue({ data: [], error: null });
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("is deterministic for the same actor", () => {
		const store = useFeatureFlagStore();
		store.flagMeta.neon_sign_v2_enabled = {
			key: "neon_sign_v2_enabled",
			enabled: true,
			kill_switch: false,
			rollout_percent: 37,
			config: {},
		};
		const actorId = "visitor-abc";
		const first = store.isEnabledForActor("neon_sign_v2_enabled", actorId);
		const second = store.isEnabledForActor("neon_sign_v2_enabled", actorId);
		expect(first).toBe(second);
	});

	it("respects rollout boundaries and kill switch", () => {
		const store = useFeatureFlagStore();
		store.flagMeta.neon_sign_v2_enabled = {
			key: "neon_sign_v2_enabled",
			enabled: true,
			kill_switch: false,
			rollout_percent: 0,
			config: {},
		};
		expect(store.isEnabledForActor("neon_sign_v2_enabled", "user-1")).toBe(
			false,
		);

		store.flagMeta.neon_sign_v2_enabled.rollout_percent = 100;
		expect(store.isEnabledForActor("neon_sign_v2_enabled", "user-1")).toBe(
			true,
		);

		store.flagMeta.neon_sign_v2_enabled.kill_switch = true;
		expect(store.isEnabledForActor("neon_sign_v2_enabled", "user-1")).toBe(
			false,
		);
		expect(store.isEnabled("neon_sign_v2_enabled")).toBe(false);
	});

	it("preserves loaded flag state on transient refresh failures", async () => {
		const store = useFeatureFlagStore();
		await store.refreshFlags({ force: true });
		store.flags.custom_discovery = true;
		store.flagMeta.custom_discovery = {
			key: "custom_discovery",
			enabled: true,
			kill_switch: false,
			rollout_percent: 100,
			config: { cohort: "sticky" },
		};

		mockState.limit.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		await store.refreshFlags({ force: true });

		expect(store.flags.custom_discovery).toBe(true);
		expect(store.flagMeta.custom_discovery.config).toEqual({
			cohort: "sticky",
		});
		expect(console.error).not.toHaveBeenCalled();
	});
});
