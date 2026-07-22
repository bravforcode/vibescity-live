import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        })),
      })),
      insert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
      upsert: vi.fn(async () => ({ data: null, error: null })),
    })),
  },
}));

import { useUserPreferencesStore } from "../../../src/store/userPreferencesStore";

describe("userPreferencesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("state", () => {
    it("starts with null home location", () => {
      const store = useUserPreferencesStore();
      expect(store.homeLocation).toBeNull();
    });

    it("starts with empty saved places", () => {
      const store = useUserPreferencesStore();
      expect(store.savedPlaces).toEqual([]);
    });

    it("starts with default preferred nav app", () => {
      const store = useUserPreferencesStore();
      expect(store.preferredNavApp).toBe("googleMaps");
    });
  });

  describe("setHomeLocation", () => {
    it("sets home location with array coords", () => {
      const store = useUserPreferencesStore();
      const result = store.setHomeLocation([13.7563, 100.5018], "Home");
      expect(result).toBe(true);
      expect(store.homeLocation).toEqual([13.7563, 100.5018]);
      expect(store.homeName).toBe("Home");
    });

    it("sets home location with object coords", () => {
      const store = useUserPreferencesStore();
      const result = store.setHomeLocation({ lat: 13.7563, lng: 100.5018 });
      expect(result).toBe(true);
      expect(store.homeLocation).toEqual([13.7563, 100.5018]);
    });

    it("returns false for invalid coords", () => {
      const store = useUserPreferencesStore();
      expect(store.setHomeLocation(null)).toBe(false);
      expect(store.setHomeLocation({ lat: "bad", lng: "bad" })).toBe(false);
    });
  });

  describe("addSavedPlace", () => {
    it("adds a saved place", () => {
      const store = useUserPreferencesStore();
      const id = store.addSavedPlace("Office", [13.7563, 100.5018]);
      expect(store.savedPlaces.length).toBe(1);
      expect(store.savedPlaces[0].name).toBe("Office");
      expect(store.savedPlaces[0].coords).toEqual([13.7563, 100.5018]);
      expect(id).toBeDefined();
    });

    it("adds with object coords", () => {
      const store = useUserPreferencesStore();
      store.addSavedPlace("Gym", { lat: 13.7564, lng: 100.5019 });
      expect(store.savedPlaces.length).toBe(1);
      expect(store.savedPlaces[0].coords).toEqual([13.7564, 100.5019]);
    });
  });

  describe("removeSavedPlace", () => {
    it("removes a saved place by id", () => {
      const store = useUserPreferencesStore();
      // Mock Date.now so each addSavedPlace gets a unique ID
      let counter = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => counter++);
      const id1 = store.addSavedPlace("Office", [13.7563, 100.5018]);
      const id2 = store.addSavedPlace("Gym", [13.7564, 100.5019]);
      expect(id1).not.toBe(id2);
      expect(store.savedPlaces.length).toBe(2);
      store.removeSavedPlace(id1);
      expect(store.savedPlaces.length).toBe(1);
      expect(store.savedPlaces[0].name).toBe("Gym");
      vi.restoreAllMocks();
    });
  });

  describe("clearHome", () => {
    it("clears home location", () => {
      const store = useUserPreferencesStore();
      store.setHomeLocation([13.7563, 100.5018], "Home");
      expect(store.homeLocation).not.toBeNull();
      store.clearHome();
      expect(store.homeLocation).toBeNull();
      expect(store.homeName).toBe("Home");
    });
  });

  describe("navApps", () => {
    it("returns navigation apps object", () => {
      const store = useUserPreferencesStore();
      expect(store.navApps).toBeDefined();
      expect(typeof store.navApps).toBe("object");
      expect(store.navApps.googleMaps).toBeDefined();
      expect(store.navApps.googleMaps.name).toBe("Google Maps");
    });
  });

  describe("setPreferredNavApp", () => {
    it("sets preferred nav app", () => {
      const store = useUserPreferencesStore();
      store.setPreferredNavApp("waze");
      expect(store.preferredNavApp).toBe("waze");
    });

    it("ignores invalid app key", () => {
      const store = useUserPreferencesStore();
      store.setPreferredNavApp("invalid");
      expect(store.preferredNavApp).toBe("googleMaps");
    });
  });

  describe("hasHomeSet", () => {
    it("returns true when home is set", () => {
      const store = useUserPreferencesStore();
      expect(store.hasHomeSet).toBe(false);
      store.setHomeLocation([13.7563, 100.5018]);
      expect(store.hasHomeSet).toBe(true);
    });
  });
});
