import { describe, expect, it } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        lte: vi.fn(async () => ({
          data: [
            {
              id: "e1",
              name: "Hospital A",
              type: "hospital",
              latitude: 13.7563,
              longitude: 100.5018,
              phone: "02-123-4567",
            },
            {
              id: "e2",
              name: "Police Station B",
              type: "police",
              latitude: 13.757,
              longitude: 100.502,
              phone: "191",
            },
          ],
          error: null,
        })),
      })),
    })),
  },
}));

import {
  EMERGENCY_CONTACTS,
  getNearbyEmergency,
  getEmergencySearchLink,
  getEmergencyFallbackState,
  getCallLink,
  getDirectionsLink,
} from "../../../src/services/emergencyService";

describe("emergencyService", () => {
  describe("EMERGENCY_CONTACTS", () => {
    it("has police contact", () => {
      expect(EMERGENCY_CONTACTS).toBeDefined();
      expect(EMERGENCY_CONTACTS.police).toBeDefined();
      expect(EMERGENCY_CONTACTS.police.number).toBe("191");
    });

    it("has ambulance contact", () => {
      expect(EMERGENCY_CONTACTS.ambulance).toBeDefined();
      expect(EMERGENCY_CONTACTS.ambulance.number).toBe("1669");
    });

    it("has tourist police", () => {
      expect(EMERGENCY_CONTACTS.touristPolice).toBeDefined();
      expect(EMERGENCY_CONTACTS.touristPolice.number).toBe("1155");
    });

    it("has fire department", () => {
      expect(EMERGENCY_CONTACTS.fire).toBeDefined();
      expect(EMERGENCY_CONTACTS.fire.number).toBe("199");
    });
  });

  describe("getEmergencySearchLink", () => {
    it("returns a Google Maps search URL", () => {
      const url = getEmergencySearchLink("hospital", 13.7563, 100.5018);
      expect(url).toContain("google.com/maps/search");
      expect(url).toContain("hospital");
    });

    it("returns police search URL", () => {
      const url = getEmergencySearchLink("police", 13.7563, 100.5018);
      expect(url).toContain("police");
    });
  });

  describe("getEmergencyFallbackState", () => {
    it("returns fallback with search links", () => {
      const fallback = getEmergencyFallbackState(13.7563, 100.5018);
      expect(fallback.nearest).toEqual([]);
      expect(fallback.hospitals).toEqual([]);
      expect(fallback.police).toEqual([]);
      expect(fallback.searchLinks).toBeDefined();
      expect(fallback.searchLinks.hospitals).toContain("google.com");
    });
  });

  describe("getCallLink", () => {
    it("returns tel: link", () => {
      expect(getCallLink("191")).toBe("tel:191");
    });

    it("strips spaces from number", () => {
      expect(getCallLink("02-123-4567")).toBe("tel:02-123-4567");
    });
  });

  describe("getDirectionsLink", () => {
    it("returns Google Maps directions URL", () => {
      const url = getDirectionsLink(13.7563, 100.5018);
      expect(url).toContain("google.com/maps/dir");
      expect(url).toContain("13.7563");
    });
  });

  describe("getNearbyEmergency", () => {
    it("returns fallback when no data available", async () => {
      const result = await getNearbyEmergency(13.7563, 100.5018);
      expect(result).toBeDefined();
      expect(result.nearest).toBeDefined();
      expect(Array.isArray(result.nearest)).toBe(true);
    });
  });
});
