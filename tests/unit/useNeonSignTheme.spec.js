import { describe, expect, it } from "vitest";
import {
	buildNeonSubline,
	hashNeonKey,
	normalizeNeonText,
	useNeonSignTheme,
} from "../../src/composables/map/useNeonSignTheme";

describe("useNeonSignTheme", () => {
	it("returns deterministic descriptor for the same shop", () => {
		const { getNeonDescriptor } = useNeonSignTheme();
		const shop = {
			id: "shop-123",
			name: "Nimman Bar",
			category: "bar",
			vibeTag: "cocktails",
			status: "LIVE",
		};
		const first = getNeonDescriptor(shop);
		const second = getNeonDescriptor(shop);
		expect(first).toEqual(second);
		expect(first.neon_signature_v2).toBeTruthy();
		expect(first.neon_signature_version).toBe("2-stable");
		expect(first.neon_experiment_id).toBe("stable");
	});

	it("changes signature token by experiment id while remaining deterministic", () => {
		const { getNeonDescriptor } = useNeonSignTheme();
		const shop = {
			id: "shop-999",
			name: "Rustic Live",
			category: "bar",
		};
		const stableA = getNeonDescriptor(shop, {
			signatureVersion: "2-stable",
			experimentId: "stable",
		});
		const stableB = getNeonDescriptor(shop, {
			signatureVersion: "2-stable",
			experimentId: "stable",
		});
		const exp = getNeonDescriptor(shop, {
			signatureVersion: "2-exp-heavy",
			experimentId: "exp-heavy",
		});
		expect(stableA.neon_signature_v2).toBe(stableB.neon_signature_v2);
		expect(exp.neon_signature_v2).not.toBe(stableA.neon_signature_v2);
	});

	it("distributes variants across many ids", () => {
		const { getNeonDescriptor } = useNeonSignTheme();
		const counts = new Map();
		const categories = ["bar", "cafe", "food", "art", "vegan", "club", "shop"];
		for (let i = 0; i < 5000; i += 1) {
			const desc = getNeonDescriptor({
				id: `shop-${i}`,
				name: `Shop ${i}`,
				category: categories[i % categories.length],
			});
			counts.set(desc.neon_palette, (counts.get(desc.neon_palette) || 0) + 1);
		}
		expect(counts.size).toBeGreaterThanOrEqual(4);
		const maxBucket = Math.max(...counts.values());
		expect(maxBucket).toBeLessThan(2200);
	});

	it("normalizes long text and supports thai/english inputs", () => {
		const normalized = normalizeNeonText(
			"The Rustic Spike Live Music and Cocktail House",
			{ maxLen: 20 },
		);
		expect(normalized.length).toBeLessThanOrEqual(20);
		expect(normalized.endsWith("...")).toBe(true);

		const thaiSubline = buildNeonSubline({
			name: "ร้านทดสอบ",
			vibeTag: "ชิลมาก",
		});
		expect(thaiSubline.length).toBeGreaterThan(0);
	});

	it("falls back to status subline when vibe/category missing", () => {
		const subline = buildNeonSubline({ status: "OPEN" });
		expect(subline).toBe("OPEN NOW");
	});

	it("hashes stable key input", () => {
		const a = hashNeonKey({ id: "1", name: "A" });
		const b = hashNeonKey({ id: "1", name: "A" });
		expect(a).toBe(b);
	});
});
