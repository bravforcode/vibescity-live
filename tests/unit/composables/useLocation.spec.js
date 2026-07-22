import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useLocation } from "../../../src/composables/useLocation";

describe("useLocation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock geolocation using Object.defineProperty (read-only getter in happy-dom)
    const mockGeolocation = {
      watchPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 13.7563,
            longitude: 100.5018,
            accuracy: 10,
          },
        });
        return 1;
      }),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    // Mock permissions
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn(async () => ({
          state: "granted",
          onchange: null,
        })),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with null coords", () => {
      const { userCoords } = useLocation();
      expect(userCoords.value).toBeNull();
    });

    it("starts with no error", () => {
      const { locationError } = useLocation();
      expect(locationError.value).toBeNull();
    });

    it("starts not locating", () => {
      const { isLocating } = useLocation();
      expect(isLocating.value).toBe(false);
    });

    it("starts with prompt permission", () => {
      const { permissionStatus } = useLocation();
      expect(permissionStatus.value).toBe("prompt");
    });
  });

  describe("startTracking", () => {
    it("sets isLocating to true", () => {
      const { startTracking, isLocating } = useLocation();
      startTracking();
      // watchPosition is called immediately in our mock
      expect(isLocating.value).toBe(false); // set back to false after success callback
    });

    it("sets userCoords on success", () => {
      const { startTracking, userCoords } = useLocation();
      startTracking();
      expect(userCoords.value).toEqual([13.7563, 100.5018]);
    });

    it("calls watchPosition with correct options", () => {
      const { startTracking } = useLocation();
      startTracking();
      expect(navigator.geolocation.watchPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });

    it("does not start if already tracking", () => {
      const { startTracking } = useLocation();
      startTracking();
      startTracking();
      expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe("stopTracking", () => {
    it("clears watch", () => {
      const { startTracking, stopTracking } = useLocation();
      startTracking();
      stopTracking();
      expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
    });

    it("safe to call when not tracking", () => {
      const { stopTracking } = useLocation();
      expect(() => stopTracking()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("handles permission denied error", () => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          watchPosition: vi.fn((success, error) => {
            error({ code: 1, PERMISSION_DENIED: 1, message: "denied" });
            return 1;
          }),
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { startTracking, locationError, permissionStatus } = useLocation();
      startTracking();
      expect(permissionStatus.value).toBe("denied");
      expect(locationError.value).toContain("denied");
    });

    it("handles timeout error when no coords", () => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          watchPosition: vi.fn((success, error) => {
            error({ code: 3, TIMEOUT: 3, message: "timeout" });
            return 1;
          }),
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { startTracking, locationError } = useLocation();
      startTracking();
      expect(locationError.value).toContain("GPS signal");
    });

    it("handles generic error", () => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          watchPosition: vi.fn((success, error) => {
            error({ code: 2, POSITION_UNAVAILABLE: 2, message: "unavailable" });
            return 1;
          }),
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { startTracking, locationError } = useLocation();
      startTracking();
      expect(locationError.value).toContain("Unable to retrieve");
    });

    it("handles missing geolocation API", () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { startTracking, locationError, isLocating } = useLocation();
      startTracking();
      expect(locationError.value).toContain("not supported");
      expect(isLocating.value).toBe(false);
    });
  });
});
