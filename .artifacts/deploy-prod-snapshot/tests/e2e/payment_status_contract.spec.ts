import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test.describe("Payment status contract doc", { tag: "@smoke" }, () => {
	test("documents canonical session_id and legacy orderId fallback", async () => {
		const docPath = join(process.cwd(), "docs/contracts/payment-status.md");
		const content = readFileSync(docPath, "utf8");

		expect(content).toContain("session_id");
		expect(content).toContain("orderId");
		expect(content.toLowerCase()).toContain("deprecated");
	});
});
