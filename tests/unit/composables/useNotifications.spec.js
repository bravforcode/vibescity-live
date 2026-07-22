import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

import { useNotifications } from "../../../src/composables/useNotifications";

describe("useNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module-level state between tests
    const { state } = useNotifications();
    state.queue.splice(0);
    state.counter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("state", () => {
    it("starts with empty queue", () => {
      const { state } = useNotifications();
      expect(state.queue).toEqual([]);
    });
  });

  describe("notify", () => {
    it("adds a notification to queue", async () => {
      const { notify, state } = useNotifications();
      notify({ title: "Test", message: "Hello" });
      await nextTick();
      expect(state.queue.length).toBe(1);
      expect(state.queue[0].title).toBe("Test");
    });

    it("adds notification with auto-incremented id", async () => {
      const { notify, state } = useNotifications();
      const id1 = notify({ title: "A", message: "1" });
      const id2 = notify({ title: "B", message: "2" });
      await nextTick();
      expect(id2).toBe(id1 + 1);
      expect(state.queue.length).toBe(2);
    });

    it("auto-dismisses after duration", async () => {
      const { notify, state } = useNotifications();
      notify({ title: "Test", message: "Hello", duration: 1000 });
      await nextTick();
      expect(state.queue.length).toBe(1);
      vi.advanceTimersByTime(1001);
      await nextTick();
      expect(state.queue.length).toBe(0);
    });

    it("does not auto-dismiss when duration is 0", async () => {
      const { notify, state } = useNotifications();
      notify({ title: "Test", message: "Hello", duration: 0 });
      await nextTick();
      vi.advanceTimersByTime(10000);
      await nextTick();
      expect(state.queue.length).toBe(1);
    });
  });

  describe("dismiss", () => {
    it("removes notification by id", async () => {
      const { notify, dismiss, state } = useNotifications();
      const id = notify({ title: "Test", message: "Hello" });
      await nextTick();
      expect(state.queue.length).toBe(1);
      dismiss(id);
      await nextTick();
      expect(state.queue.length).toBe(0);
    });
  });

  describe("notifySuccess", () => {
    it("creates success notification", async () => {
      const { notifySuccess, state } = useNotifications();
      notifySuccess("Success!", "Operation completed");
      await nextTick();
      expect(state.queue.length).toBe(1);
      expect(state.queue[0].type).toBe("success");
    });
  });

  describe("notifyError", () => {
    it("creates error notification", async () => {
      const { notifyError, state } = useNotifications();
      notifyError("Error!", "Something went wrong");
      await nextTick();
      expect(state.queue.length).toBe(1);
      expect(state.queue[0].type).toBe("error");
    });
  });
});
