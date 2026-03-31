import { describe, expect, it } from "vitest";
import {
	calculateDistance,
	calculateShopStatus,
	getPinIconUrl,
	getShopPriority,
	getStatusBoxClass,
	getStatusColorClass,
	isGoldenTime,
} from "../../../src/utils/shopUtils";

// Helper: build a Date at a specific HH:MM
const timeAt = (h, m = 0) => {
	const d = new Date(2024, 0, 15);
	d.setHours(h, m, 0, 0);
	return d;
};

describe("shopUtils", () => {
	// ─── calculateDistance ─────────────────────────────────────────────────
	describe("calculateDistance", () => {
		it("returns 0 for identical coordinates", () => {
			const d = calculateDistance(18.7883, 98.9853, 18.7883, 98.9853);
			expect(d).toBeCloseTo(0, 3);
		});

		it("returns non-zero for different coordinates", () => {
			const d = calculateDistance(18.7883, 98.9853, 18.7893, 98.9863);
			expect(d).toBeGreaterThan(0);
		});

		it("calculates roughly correct distance (Chiang Mai reference points)", () => {
			// ~1 km apart horizontally in Chiang Mai
			const d = calculateDistance(18.7883, 98.9853, 18.7883, 99.0);
			expect(d).toBeGreaterThan(0.5);
			expect(d).toBeLessThan(5);
		});

		it("returns null when any coordinate is missing", () => {
			expect(calculateDistance(null, 98.9853, 18.7883, 98.9853)).toBeNull();
			expect(calculateDistance(18.7883, null, 18.7883, 98.9853)).toBeNull();
			expect(calculateDistance(18.7883, 98.9853, null, 98.9853)).toBeNull();
			expect(calculateDistance(18.7883, 98.9853, 18.7883, null)).toBeNull();
		});
	});

	// ─── calculateShopStatus ──────────────────────────────────────────────
	describe("calculateShopStatus", () => {
		it("returns LIVE for manual LIVE status regardless of time", () => {
			const shop = { originalStatus: "LIVE" };
			expect(calculateShopStatus(shop, timeAt(3))).toBe("LIVE");
			expect(calculateShopStatus(shop, timeAt(14))).toBe("LIVE");
		});

		it("returns ACTIVE for manual ACTIVE status", () => {
			const shop = { originalStatus: "ACTIVE" };
			expect(calculateShopStatus(shop, timeAt(10))).toBe("ACTIVE");
		});

		it("returns OFF for manual OFF status", () => {
			const shop = { originalStatus: "OFF" };
			expect(calculateShopStatus(shop, timeAt(20))).toBe("OFF");
		});

		it("returns ACTIVE for FORCE OPEN status", () => {
			const shop = { originalStatus: "FORCE OPEN" };
			expect(calculateShopStatus(shop, timeAt(3))).toBe("ACTIVE");
		});

		it("returns TONIGHT for TONIGHT status", () => {
			const shop = { originalStatus: "TONIGHT" };
			expect(calculateShopStatus(shop, timeAt(10))).toBe("TONIGHT");
		});

		it("returns ACTIVE during open hours (AUTO)", () => {
			const shop = { openTime: "10:00", closeTime: "22:00" };
			expect(calculateShopStatus(shop, timeAt(14))).toBe("ACTIVE");
		});

		it("returns OFF before open hours (day shop, AUTO)", () => {
			const shop = { openTime: "10:00", closeTime: "18:00" };
			expect(calculateShopStatus(shop, timeAt(8))).toBe("OFF");
		});

		it("returns OFF after close time (day shop, AUTO)", () => {
			const shop = { openTime: "09:00", closeTime: "17:00" };
			expect(calculateShopStatus(shop, timeAt(20))).toBe("OFF");
		});

		it("returns TONIGHT for night shop during day hours", () => {
			// Opens 20:00, now is 12:00
			const shop = { openTime: "20:00", closeTime: "02:00" };
			// 12:00 = 720 minutes >= 360 (06:00), < 20*60=1200 -> TONIGHT
			expect(calculateShopStatus(shop, timeAt(12))).toBe("TONIGHT");
		});

		it("handles overnight open hours correctly", () => {
			// Opens 22:00, closes 04:00 — should be ACTIVE at 23:00
			const shop = { openTime: "22:00", closeTime: "04:00" };
			expect(calculateShopStatus(shop, timeAt(23))).toBe("ACTIVE");
		});

		it("returns OFF with no time info and no manual status", () => {
			const shop = {};
			expect(calculateShopStatus(shop, timeAt(14))).toBe("OFF");
		});
	});

	// ─── isGoldenTime ──────────────────────────────────────────────────────
	describe("isGoldenTime", () => {
		it("returns true during golden hours", () => {
			const shop = { goldenStart: "21:00", goldenEnd: "23:00" };
			expect(isGoldenTime(shop, timeAt(22))).toBe(true);
		});

		it("returns false outside golden hours", () => {
			const shop = { goldenStart: "21:00", goldenEnd: "23:00" };
			expect(isGoldenTime(shop, timeAt(14))).toBe(false);
		});

		it("returns false when golden times are not set", () => {
			const shop = {};
			expect(isGoldenTime(shop, timeAt(22))).toBe(false);
		});
	});

	// ─── getStatusColorClass ───────────────────────────────────────────────
	describe("getStatusColorClass", () => {
		it("returns red class for LIVE", () => {
			expect(getStatusColorClass("LIVE")).toBe("bg-red-600");
		});

		it("returns orange class for TONIGHT", () => {
			expect(getStatusColorClass("TONIGHT")).toBe("bg-orange-600");
		});

		it("returns zinc class for other statuses", () => {
			expect(getStatusColorClass("OFF")).toBe("bg-zinc-700");
			expect(getStatusColorClass("ACTIVE")).toBe("bg-zinc-700");
			expect(getStatusColorClass()).toBe("bg-zinc-700");
		});

		it("matching is case-insensitive", () => {
			expect(getStatusColorClass("live")).toBe("bg-red-600");
			expect(getStatusColorClass("tonight")).toBe("bg-orange-600");
		});
	});

	// ─── getStatusBoxClass ─────────────────────────────────────────────────
	describe("getStatusBoxClass", () => {
		it("returns red glow class for LIVE", () => {
			expect(getStatusBoxClass("LIVE")).toContain("bg-red-600");
			expect(getStatusBoxClass("LIVE")).toContain("shadow-");
		});

		it("returns orange glow class for TONIGHT", () => {
			expect(getStatusBoxClass("TONIGHT")).toContain("bg-orange-600");
			expect(getStatusBoxClass("TONIGHT")).toContain("shadow-");
		});

		it("returns zinc class for other statuses", () => {
			expect(getStatusBoxClass("OFF")).toBe("bg-zinc-700");
		});
	});

	// ─── getPinIconUrl ─────────────────────────────────────────────────────
	describe("getPinIconUrl", () => {
		it("returns red pin for LIVE", () => {
			expect(getPinIconUrl("LIVE")).toBe("/images/pins/pin-red.svg");
		});

		it("returns orange pin for TONIGHT", () => {
			expect(getPinIconUrl("TONIGHT")).toBe("/images/pins/pin-orange.svg");
		});

		it("returns gray pin for other statuses", () => {
			expect(getPinIconUrl("OFF")).toBe("/images/pins/pin-gray.svg");
			expect(getPinIconUrl()).toBe("/images/pins/pin-gray.svg");
		});

		it("matching is case-insensitive", () => {
			expect(getPinIconUrl("live")).toBe("/images/pins/pin-red.svg");
		});
	});

	// ─── getShopPriority ───────────────────────────────────────────────────
	describe("getShopPriority", () => {
		it("returns 2 for LIVE status", () => {
			const shop = { status: "LIVE", isGolden: false };
			expect(getShopPriority(shop)).toBe(2);
		});

		it("returns 3 for TONIGHT status", () => {
			const shop = { status: "TONIGHT", isGolden: false };
			expect(getShopPriority(shop)).toBe(3);
		});

		it("returns 4 for regular shop", () => {
			const shop = { status: "ACTIVE", isGolden: false };
			expect(getShopPriority(shop)).toBe(4);
		});

		it("returns 1 for golden shop", () => {
			const shop = { status: "ACTIVE", isGolden: true };
			expect(getShopPriority(shop)).toBe(1);
		});
	});
});
