import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n.js", () => ({
	default: {
		global: {
			t: (key) => key,
		},
	},
}));

const mockState = vi.hoisted(() => ({
	profileSingle: vi.fn(),
	profileUpsert: vi.fn(),
	xpInsert: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: vi.fn(async () => ({ data: { session: null } })),
			onAuthStateChange: vi.fn(() => ({
				data: {
					subscription: {
						unsubscribe: vi.fn(),
					},
				},
			})),
			signInWithPassword: vi.fn(),
			signInWithOtp: vi.fn(),
			signOut: vi.fn(),
		},
		from: (table) => {
			if (table === "user_profiles") {
				return {
					select: () => ({
						eq: () => ({
							single: (...args) => mockState.profileSingle(...args),
						}),
					}),
					upsert: (...args) => mockState.profileUpsert(...args),
				};
			}
			if (table === "xp_logs") {
				return {
					insert: (...args) => mockState.xpInsert(...args),
				};
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

import { useUserStore } from "../../src/store/userStore";

describe("userStore error handling", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.profileSingle.mockReset();
		mockState.profileUpsert.mockReset();
		mockState.xpInsert.mockReset();
		mockState.profileSingle.mockResolvedValue({ data: null, error: null });
		mockState.profileUpsert.mockResolvedValue({ error: null });
		mockState.xpInsert.mockResolvedValue({ error: null });
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("preserves profile on transient profile fetch failures", async () => {
		const store = useUserStore();
		store.profile.displayName = "Existing Explorer";
		mockState.profileSingle.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		await store.fetchProfile("user-1");

		expect(store.profile.displayName).toBe("Existing Explorer");
		expect(console.error).not.toHaveBeenCalled();
	});

	it("suppresses expected abort errors when persisting XP logs", async () => {
		const store = useUserStore();
		store.authUser = { id: "user-1", email: "user@example.com" };
		const abortError = new DOMException(
			"The operation was aborted.",
			"AbortError",
		);
		mockState.xpInsert.mockRejectedValue(abortError);

		const result = await store.addXP(25, "test");

		expect(result.xpGained).toBe(25);
		expect(console.error).not.toHaveBeenCalled();
	});

	it("rolls back optimistic profile changes when profile persistence fails", async () => {
		const store = useUserStore();
		store.authUser = { id: "user-1", email: "user@example.com" };
		store.profile.displayName = "Existing Explorer";
		store.profile.bio = "Original bio";
		mockState.profileUpsert.mockResolvedValue({
			error: new Error("Profile update failed"),
		});

		const result = await store.updateProfile({
			displayName: "Broken Update",
			bio: "Should rollback",
		});

		expect(result).toEqual({
			success: false,
			error: "Profile update failed",
		});
		expect(store.profile.displayName).toBe("Existing Explorer");
		expect(store.profile.bio).toBe("Original bio");
	});
});
