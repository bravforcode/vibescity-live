import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/config/featureFlagGovernance", () => ({
	getFlagGovernanceViolations: vi.fn(() => []),
	validateFlagDependencies: vi.fn(() => true),
}));

vi.mock("../../../src/lib/runtimeConfig", () => ({
	isFrontendOnlyDevMode: vi.fn(() => true),
	shouldBypassDirectBrowserSupabaseReads: vi.fn(() => false),
}));

vi.mock("../../../src/lib/supabase", () => ({
	supabase: {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				limit: vi.fn(async () => ({ data: [], error: null })),
			})),
		})),
	},
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

import { useFeatureFlagStore } from "../../../src/store/featureFlagStore";

describe("featureFlagStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe("flags", () => {
		it("has default flags loaded", () => {
			const store = useFeatureFlagStore();
			expect(store.flags.use_v2_feed).toBe(true);
			expect(store.flags.use_v2_search).toBe(true);
			expect(store.flags.enable_web_vitals).toBe(false);
		});

		it("isStale returns true when not loaded", () => {
			const store = useFeatureFlagStore();
			expect(store.isStale).toBe(true);
		});
	});

	describe("getFlag", () => {
		it("returns flag meta for known key", () => {
			const store = useFeatureFlagStore();
			const flag = store.getFlag("use_v2_feed");
			expect(flag).toBeDefined();
			expect(flag.key).toBe("use_v2_feed");
			expect(flag.enabled).toBe(true);
		});

		it("returns fallback for unknown key", () => {
			const store = useFeatureFlagStore();
			const flag = store.getFlag("nonexistent_flag");
			expect(flag.enabled).toBe(false);
			expect(flag.rollout_percent).toBe(0);
		});

		it("returns null for empty key", () => {
			const store = useFeatureFlagStore();
			expect(store.getFlag("")).toBeNull();
			expect(store.getFlag(null)).toBeNull();
		});
	});

	describe("isEnabled", () => {
		it("returns true for enabled default flag", () => {
			const store = useFeatureFlagStore();
			expect(store.isEnabled("use_v2_feed")).toBe(true);
		});

		it("returns false for disabled default flag", () => {
			const store = useFeatureFlagStore();
			expect(store.isEnabled("enable_web_vitals")).toBe(false);
		});

		it("returns false for unknown flag", () => {
			const store = useFeatureFlagStore();
			expect(store.isEnabled("unknown")).toBe(false);
		});
	});

	describe("getFlagConfig", () => {
		it("returns config for known flag", () => {
			const store = useFeatureFlagStore();
			const config = store.getFlagConfig("neon_sign_v2_enabled");
			expect(config).toBeDefined();
			expect(config.experiment_id).toBe("stable");
		});

		it("returns fallback for unknown flag", () => {
			const store = useFeatureFlagStore();
			const config = store.getFlagConfig("unknown", { default: true });
			expect(config.default).toBe(true);
		});
	});

	describe("isEnabledForActor", () => {
		it("returns true when rollout is 100%", () => {
			const store = useFeatureFlagStore();
			expect(store.isEnabledForActor("use_v2_feed", "user-1")).toBe(true);
		});

		it("returns false when flag is disabled", () => {
			const store = useFeatureFlagStore();
			expect(store.isEnabledForActor("enable_web_vitals", "user-1")).toBe(false);
		});
	});

	describe("refreshFlags", () => {
		it("sets isStale to false after refresh", async () => {
			const store = useFeatureFlagStore();
			expect(store.isStale).toBe(true);
			await store.refreshFlags({ force: true });
			expect(store.isStale).toBe(false);
		});

		it("does not refresh when already loading", async () => {
			const store = useFeatureFlagStore();
			store.isLoading = true;
			await store.refreshFlags({ force: true });
			// isLoading should still be true since refreshFlags returned early
			expect(store.isLoading).toBe(true);
		});
	});
});
