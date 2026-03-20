import { describe, expect, it } from "vitest";
import { useMobileFpsGovernor } from "../../src/composables/performance/useMobileFpsGovernor";

describe("useMobileFpsGovernor", () => {
	it("provides at least 100 auto controls", () => {
		const governor = useMobileFpsGovernor({
			forceTier: "balanced",
		});
		expect(governor.controlCatalog.value.length).toBeGreaterThanOrEqual(100);
		expect(governor.summary.value.controlCount).toBe(
			governor.controlCatalog.value.length,
		);
	});

	it("applies forced critical tier settings", () => {
		const governor = useMobileFpsGovernor({
			forceTier: "critical",
		});
		expect(governor.performanceTier.value).toBe("critical");
		expect(governor.settings.value.routeDirectionsEnabled).toBe(false);
		expect(governor.settings.value.neonLod.full).toBe(false);
		expect(governor.settings.value.neonLod.mini).toBe(true);
	});
});
