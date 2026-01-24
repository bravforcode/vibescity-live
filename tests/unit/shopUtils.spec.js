import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  calculateDistance,
  calculateShopStatus,
  isGoldenTime,
  isFlashActive,
  getStatusColorClass,
  getStatusBoxClass,
  getPinIconUrl,
  getShopPriority,
} from "@/utils/shopUtils";

describe("shopUtils.js", () => {
  // ---------- calculateDistance ----------
  describe("calculateDistance", () => {
    it("returns null when any coordinate is missing", () => {
      expect(calculateDistance(null, 1, 2, 3)).toBeNull();
      expect(calculateDistance(1, undefined, 2, 3)).toBeNull();
      expect(calculateDistance(1, 2, 0, 3)).toBeNull(); // ⚠️ note: 0 is falsy in your function
    });

    it("returns ~0 when same point", () => {
      const d = calculateDistance(18.7883, 98.9853, 18.7883, 98.9853);
      expect(d).toBeTypeOf("number");
      expect(d).toBeLessThan(0.0001);
    });

    it("returns a reasonable distance (Chiang Mai -> Bangkok ~ 580-750km)", () => {
      const cm = { lat: 18.7883, lon: 98.9853 };
      const bkk = { lat: 13.7563, lon: 100.5018 };
      const d = calculateDistance(cm.lat, cm.lon, bkk.lat, bkk.lon);
      expect(d).toBeGreaterThan(500);
      expect(d).toBeLessThan(900);
    });
  });

  // ---------- calculateShopStatus ----------
  describe("calculateShopStatus", () => {
    it("MANUAL override: LIVE always returns LIVE", () => {
      const shop = { originalStatus: "live", openTime: "08:00", closeTime: "17:00" };
      const now = new Date("2026-01-01T12:00:00");
      expect(calculateShopStatus(shop, now)).toBe("LIVE");
    });

    it("MANUAL override: ACTIVE always returns ACTIVE", () => {
      const shop = { originalStatus: "ACTIVE", openTime: "00:00", closeTime: "00:10" };
      const now = new Date("2026-01-01T23:59:00");
      expect(calculateShopStatus(shop, now)).toBe("ACTIVE");
    });

    it("MANUAL override: OFF-ish statuses -> OFF", () => {
      const now = new Date("2026-01-01T12:00:00");
      expect(calculateShopStatus({ originalStatus: "closed" }, now)).toBe("OFF");
      expect(calculateShopStatus({ originalStatus: "maintenance" }, now)).toBe("OFF");
    });

    it("MANUAL override: TONIGHT -> TONIGHT", () => {
      const now = new Date("2026-01-01T12:00:00");
      expect(calculateShopStatus({ originalStatus: "tonight" }, now)).toBe("TONIGHT");
    });

    it("AUTO: open in range -> ACTIVE", () => {
      const shop = { originalStatus: "AUTO", openTime: "08:00", closeTime: "17:00" };
      const now = new Date("2026-01-01T10:00:00");
      expect(calculateShopStatus(shop, now)).toBe("ACTIVE");
    });

    it("AUTO: night shop -> TONIGHT from 06:00 until openTime", () => {
      const shop = { originalStatus: "AUTO", openTime: "19:00", closeTime: "02:00" };
      const now = new Date("2026-01-01T10:00:00"); // 10:00 >= 06:00 and < 19:00
      expect(calculateShopStatus(shop, now)).toBe("TONIGHT");
    });

    it("AUTO: cross-midnight range: 22:00-02:00 open at 23:00 -> ACTIVE", () => {
      const shop = { originalStatus: "AUTO", openTime: "22:00", closeTime: "02:00" };
      const now = new Date("2026-01-01T23:00:00");
      expect(calculateShopStatus(shop, now)).toBe("ACTIVE");
    });

    it("AUTO: cross-midnight range: 22:00-02:00 open at 01:00 -> ACTIVE", () => {
      const shop = { originalStatus: "AUTO", openTime: "22:00", closeTime: "02:00" };
      const now = new Date("2026-01-02T01:00:00");
      expect(calculateShopStatus(shop, now)).toBe("ACTIVE");
    });

    it("AUTO: otherwise -> OFF", () => {
      const shop = { originalStatus: "AUTO", openTime: "08:00", closeTime: "17:00" };
      const now = new Date("2026-01-01T05:00:00");
      expect(calculateShopStatus(shop, now)).toBe("OFF");
    });

    it("Missing open/close -> OFF", () => {
      const now = new Date("2026-01-01T12:00:00");
      expect(calculateShopStatus({ originalStatus: "AUTO" }, now)).toBe("OFF");
    });
  });

  // ---------- isGoldenTime ----------
  describe("isGoldenTime", () => {
    it("returns true when now is in range", () => {
      const shop = { goldenStart: "10:00", goldenEnd: "12:00" };
      const now = new Date("2026-01-01T11:00:00");
      expect(isGoldenTime(shop, now)).toBe(true);
    });

    it("supports cross-midnight golden time", () => {
      const shop = { goldenStart: "22:00", goldenEnd: "02:00" };
      expect(isGoldenTime(shop, new Date("2026-01-01T23:30:00"))).toBe(true);
      expect(isGoldenTime(shop, new Date("2026-01-02T01:30:00"))).toBe(true);
      expect(isGoldenTime(shop, new Date("2026-01-01T12:00:00"))).toBe(false);
    });
  });

  // ---------- isFlashActive (uses Date.now internally) ----------
  describe("isFlashActive", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns false if missing promotion fields", () => {
      vi.setSystemTime(new Date("2026-01-01T10:00:00"));
      expect(isFlashActive({})).toBe(false);
      expect(isFlashActive({ promotionEndtime: "10:30" })).toBe(false);
      expect(isFlashActive({ promotionInfo: "X" })).toBe(false);
    });

    it("returns true when end time is within next 20 minutes", () => {
      vi.setSystemTime(new Date("2026-01-01T10:00:00"));
      const shop = { promotionEndtime: "10:15", promotionInfo: "FLASH" };
      expect(isFlashActive(shop)).toBe(true);
    });

    it("returns false when end time is too far (>20 minutes)", () => {
      vi.setSystemTime(new Date("2026-01-01T10:00:00"));
      const shop = { promotionEndtime: "10:45", promotionInfo: "FLASH" };
      expect(isFlashActive(shop)).toBe(false);
    });

    it("returns false when already expired", () => {
      vi.setSystemTime(new Date("2026-01-01T10:30:00"));
      const shop = { promotionEndtime: "10:15", promotionInfo: "FLASH" };
      expect(isFlashActive(shop)).toBe(false);
    });
  });

  // ---------- class & icon helpers ----------
  describe("status helpers", () => {
    it("getStatusColorClass", () => {
      expect(getStatusColorClass("LIVE")).toBe("bg-red-600");
      expect(getStatusColorClass("Tonight")).toBe("bg-orange-600");
      expect(getStatusColorClass("active")).toBe("bg-zinc-700");
    });

    it("getStatusBoxClass", () => {
      expect(getStatusBoxClass("LIVE")).toContain("bg-red-600");
      expect(getStatusBoxClass("TONIGHT")).toContain("bg-orange-600");
      expect(getStatusBoxClass("ACTIVE")).toBe("bg-zinc-700");
    });

    it("getPinIconUrl", () => {
      expect(getPinIconUrl("LIVE")).toBe("/images/pins/pin-red.svg");
      expect(getPinIconUrl("TONIGHT")).toBe("/images/pins/pin-orange.svg");
      expect(getPinIconUrl("ACTIVE")).toBe("/images/pins/pin-gray.svg");
    });
  });

  // ---------- getShopPriority ----------
  describe("getShopPriority", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("Flash active has highest priority (0)", () => {
      vi.setSystemTime(new Date("2026-01-01T10:00:00"));
      const shop = { promotionEndtime: "10:10", promotionInfo: "FLASH", status: "ACTIVE" };
      expect(getShopPriority(shop)).toBe(0);
    });

    it("Golden time -> priority 1", () => {
      // getShopPriority uses shop.isGolden already computed in your app
      const shop = { isGolden: true, status: "ACTIVE" };
      expect(getShopPriority(shop)).toBe(1);
    });

    it("LIVE -> priority 2, TONIGHT -> 3, else -> 4", () => {
      expect(getShopPriority({ status: "LIVE" })).toBe(2);
      expect(getShopPriority({ status: "TONIGHT" })).toBe(3);
      expect(getShopPriority({ status: "ACTIVE" })).toBe(4);
    });
  });
});
