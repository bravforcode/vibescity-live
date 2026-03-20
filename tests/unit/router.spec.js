import { describe, expect, it } from "vitest";
import router from "../../src/router";

describe("router merchant routes", () => {
	it("resolves localized merchant dashboard route", () => {
		const resolved = router.resolve("/th/merchant");
		expect(resolved.name).toBe("MerchantLocale");
		expect(resolved.path).toBe("/th/merchant");
	});

	it("keeps legacy merchant dashboard route", () => {
		const resolved = router.resolve("/merchant");
		expect(resolved.name).toBe("MerchantDashboard");
		expect(resolved.path).toBe("/merchant");
	});
});
