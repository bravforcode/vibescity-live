import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChannel = {
  on: vi.fn(() => mockChannel),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: "room-1", name: "Test Room", shop_id: "shop-1" },
            error: null,
          })),
        })),
      })),
      insert: vi.fn(async () => ({ data: null, error: null })),
    })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  },
}));

import { useRoomStore } from "../../../src/store/roomStore";

describe("roomStore", () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  describe("state", () => {
    it("starts with empty counts and no room", () => {
      const store = useRoomStore();
      expect(store.currentRoomId).toBeNull();
      expect(store.isConnected).toBe(false);
      expect(store.shopCounts).toEqual({});
      expect(store.shopPresence).toEqual({});
    });
  });

  describe("getCount", () => {
    it("returns 0 for unknown shop", () => {
      const store = useRoomStore();
      expect(store.getCount("nonexistent")).toBe(0);
    });

    it("returns count for known shop", () => {
      const store = useRoomStore();
      store.shopCounts = { "shop-1": 5 };
      expect(store.getCount("shop-1")).toBe(5);
    });
  });

  describe("getPresence", () => {
    it("returns empty array for unknown shop", () => {
      const store = useRoomStore();
      expect(store.getPresence("nonexistent")).toEqual([]);
    });
  });

  describe("updateCounts", () => {
    it("merges counts", () => {
      const store = useRoomStore();
      store.updateCounts({ "shop-1": 3, "shop-2": 7 });
      expect(store.shopCounts["shop-1"]).toBe(3);
      expect(store.shopCounts["shop-2"]).toBe(7);
    });
  });

  describe("adjustCount", () => {
    it("increments count", () => {
      const store = useRoomStore();
      store.adjustCount("shop-1", 1);
      expect(store.getCount("shop-1")).toBe(1);
      store.adjustCount("shop-1", 2);
      expect(store.getCount("shop-1")).toBe(3);
    });
  });

  describe("computed", () => {
    it("totalActiveUsers returns sum of all counts", () => {
      const store = useRoomStore();
      store.shopCounts = { "shop-1": 3, "shop-2": 7 };
      expect(store.totalActiveUsers).toBe(10);
    });

    it("hotSpots returns top 10 shops by count", () => {
      const store = useRoomStore();
      store.shopCounts = { "shop-1": 5, "shop-2": 10, "shop-3": 1 };
      expect(store.hotSpots.length).toBe(3);
      expect(store.hotSpots[0].id).toBe("shop-2");
    });
  });
});
