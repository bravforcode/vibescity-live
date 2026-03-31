import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n.js", () => ({
	default: {
		global: {
			locale: { value: "en" },
			t: vi.fn((key) => key),
		},
	},
}));

vi.mock("../../../src/services/vibeService", () => ({
	default: {
		getZoneVibes: vi.fn(async () => []),
		getPlaceVibe: vi.fn(async () => null),
		getLeaderboard: vi.fn(async () => null),
		getSystemStatus: vi.fn(async () => null),
		subscribeToVibeUpdates: vi.fn(() => {}),
		claimVibe: vi.fn(async () => ({
			vibe_points: 10,
			next_claim_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
		})),
		trackVibeInteraction: vi.fn(),
		emitVibeUpdate: vi.fn(),
	},
}));

import { useVibeSystem } from "../../../src/composables/useVibeSystem";

// Mount the composable inside a Vue component for lifecycle support
function withSetup(composable) {
	let result;
	const Comp = defineComponent({
		setup() {
			result = composable();
			return () => null;
		},
	});
	const wrapper = mount(Comp);
	return [result, wrapper];
}

describe("useVibeSystem", () => {
	let result;
	let wrapper;

	beforeEach(() => {
		[result, wrapper] = withSetup(useVibeSystem);
	});

	afterEach(() => {
		wrapper.unmount();
	});

	// ─── Returned shape ────────────────────────────────────────────────────
	describe("returned shape", () => {
		it("exposes expected state refs", () => {
			expect(result).toHaveProperty("isClaiming");
			expect(result).toHaveProperty("claimCooldown");
			expect(result).toHaveProperty("zoneVibes");
			expect(result).toHaveProperty("placeVibes");
			expect(result).toHaveProperty("leaderboard");
			expect(result).toHaveProperty("lastError");
		});

		it("exposes expected computed properties", () => {
			expect(result).toHaveProperty("totalVibePoints");
			expect(result).toHaveProperty("activeZones");
			expect(result).toHaveProperty("topContributor");
			expect(result).toHaveProperty("canClaimVibe");
			expect(result).toHaveProperty("cooldownMinutes");
		});

		it("exposes expected methods", () => {
			expect(typeof result.claimPlaceVibe).toBe("function");
			expect(typeof result.claimZoneVibe).toBe("function");
			expect(typeof result.loadZoneVibes).toBe("function");
			expect(typeof result.loadLeaderboard).toBe("function");
		});
	});

	// ─── totalVibePoints ───────────────────────────────────────────────────
	describe("totalVibePoints", () => {
		it("returns 0 when no zones", () => {
			expect(result.totalVibePoints.value).toBe(0);
		});

		it("sums current_vibe * 100 across all zones", () => {
			result.zoneVibes.value = [
				{ zone_id: "z1", current_vibe: 0.5, active_users: 1 },
				{ zone_id: "z2", current_vibe: 1.0, active_users: 2 },
			];
			expect(result.totalVibePoints.value).toBeCloseTo(150, 1);
		});
	});

	// ─── activeZones ───────────────────────────────────────────────────────
	describe("activeZones", () => {
		it("returns empty array when no zones", () => {
			expect(result.activeZones.value).toHaveLength(0);
		});

		it("filters zones with active_users > 0", () => {
			result.zoneVibes.value = [
				{ zone_id: "z1", current_vibe: 0.5, active_users: 3 },
				{ zone_id: "z2", current_vibe: 0.2, active_users: 0 },
				{ zone_id: "z3", current_vibe: 0.8, active_users: 1 },
			];
			const active = result.activeZones.value;
			expect(active).toHaveLength(2);
			expect(active.map((z) => z.zone_id)).toContain("z1");
			expect(active.map((z) => z.zone_id)).toContain("z3");
		});

		it("excludes zones with 0 active_users", () => {
			result.zoneVibes.value = [
				{ zone_id: "z1", current_vibe: 1.0, active_users: 0 },
			];
			expect(result.activeZones.value).toHaveLength(0);
		});
	});

	// ─── topContributor ────────────────────────────────────────────────────
	describe("topContributor", () => {
		it("returns null when no leaderboard", () => {
			expect(result.topContributor.value).toBeNull();
		});

		it("returns null when leaderboard array is empty", () => {
			result.leaderboard.value = { leaderboard: [] };
			expect(result.topContributor.value).toBeNull();
		});

		it("returns the first entry on the leaderboard", () => {
			const top = { user_id: "user-1", points: 500, rank: 1 };
			result.leaderboard.value = {
				leaderboard: [top, { user_id: "user-2", points: 300, rank: 2 }],
			};
			expect(result.topContributor.value).toEqual(top);
		});
	});

	// ─── canClaimVibe ──────────────────────────────────────────────────────
	describe("canClaimVibe", () => {
		it("returns true when no cooldown is set", () => {
			result.claimCooldown.value = null;
			expect(result.canClaimVibe.value).toBe(true);
		});

		it("returns true when cooldown has expired", () => {
			result.claimCooldown.value = Date.now() - 1000; // 1 second in the past
			expect(result.canClaimVibe.value).toBe(true);
		});

		it("returns false when cooldown is still active", () => {
			result.claimCooldown.value = Date.now() + 60000; // 1 minute in the future
			expect(result.canClaimVibe.value).toBe(false);
		});
	});

	// ─── cooldownMinutes ───────────────────────────────────────────────────
	describe("cooldownMinutes", () => {
		it("returns 0 when no cooldown", () => {
			result.claimCooldown.value = null;
			expect(result.cooldownMinutes.value).toBe(0);
		});

		it("returns 0 when cooldown has passed", () => {
			result.claimCooldown.value = Date.now() - 5000;
			expect(result.cooldownMinutes.value).toBe(0);
		});

		it("returns ceiling of remaining minutes", () => {
			// 90 seconds remaining = ceil(90/60) = 2 minutes
			result.claimCooldown.value = Date.now() + 90000;
			expect(result.cooldownMinutes.value).toBe(2);
		});

		it("returns 1 for exactly 1 minute remaining", () => {
			result.claimCooldown.value = Date.now() + 60000;
			expect(result.cooldownMinutes.value).toBe(1);
		});
	});
});
