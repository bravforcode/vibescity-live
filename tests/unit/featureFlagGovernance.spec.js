import { describe, expect, it } from "vitest";

import {
	getFlagGovernanceViolations,
	isGovernanceSunsetExceeded,
	validateFlagDependencies,
} from "../../src/config/featureFlagGovernance";

describe("feature flag governance", () => {
	it("validates dependencies for sensitive reveal", () => {
		const resultDisabled = validateFlagDependencies(
			"ff_sensitive_reveal",
			(key) => key !== "ff_partner_dashboard_v2",
		);
		const resultEnabled = validateFlagDependencies(
			"ff_sensitive_reveal",
			(key) => key === "ff_partner_dashboard_v2",
		);

		expect(resultDisabled).toBe(false);
		expect(resultEnabled).toBe(true);
	});

	it("detects sunset expiry by quarter", () => {
		expect(
			isGovernanceSunsetExceeded("2025-Q3", new Date("2026-01-01T00:00:00Z")),
		).toBe(true);
		expect(
			isGovernanceSunsetExceeded("2027-Q1", new Date("2026-01-01T00:00:00Z")),
		).toBe(false);
	});

	it("returns violation only for enabled expired flags", () => {
		const violations = getFlagGovernanceViolations({
			flags: {
				ff_owner_dashboard_v2: true,
				ff_partner_dashboard_v2: false,
			},
			now: new Date("2027-01-15T00:00:00Z"),
		});

		expect(violations.some((v) => v.key === "ff_owner_dashboard_v2")).toBe(
			true,
		);
		expect(violations.some((v) => v.key === "ff_partner_dashboard_v2")).toBe(
			false,
		);
	});
});
