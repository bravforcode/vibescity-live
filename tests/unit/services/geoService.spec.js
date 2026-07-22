import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async (fnName, params) => {
      if (fnName === "search_venues") {
        return {
          data: [
            {
              id: "v1",
              name: "Restaurant A",
              latitude: 13.7563,
              longitude: 100.5018,
              distance_meters: 500,
            },
            {
              id: "v2",
              name: "Restaurant B",
              latitude: 13.7564,
              longitude: 100.5019,
              distance_meters: 1200,
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        gte: vi.fn(() => ({
          lte: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(async () => ({
                data: [{ id: "v3", name: "Shop C" }],
                error: null,
              })),
            })),
          })),
        })),
      })),
    })),
  },
}));

import { getNearbyShops, getShopsInBounds } from "../../../src/services/geoService";

describe("geoService", () => {
  describe("getNearbyShops", () => {
    it("returns nearby shops with distance", async () => {
      const result = await getNearbyShops({
        lat: 13.7563,
        lng: 100.5018,
        radiusKm: 5,
      });
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe("v1");
    });

    it("returns shops sorted by distance", async () => {
      const result = await getNearbyShops({
        lat: 13.7563,
        lng: 100.5018,
        radiusKm: 5,
      });
      expect(result[0].distance_meters).toBeLessThan(result[1].distance_meters);
    });
  });

  describe("getShopsInBounds", () => {
    it("returns shops within bounds", async () => {
      const result = await getShopsInBounds({
        minLat: 13.7,
        maxLat: 13.8,
        minLng: 100.4,
        maxLng: 100.6,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
