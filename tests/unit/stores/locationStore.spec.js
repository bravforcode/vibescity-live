import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	queryPermissionMock,
	getCurrentPositionMock,
	watchPositionMock,
	clearWatchMock,
} = vi.hoisted(() => ({
	queryPermissionMock: vi.fn(),
	getCurrentPositionMock: vi.fn(),
	watchPositionMock: vi.fn(),
	clearWatchMock: vi.fn(),
}));

vi.mock("../../../src/lib/runtimeConfig", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		shouldUseDeterministicLocalDevLocation: vi.fn(() => false),
		shouldPreferRealLocalDevLocation: vi.fn(() => false),
	};
});

import { useLocationStore } from "../../../src/store/locationStore";

describe("locationStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		vi.stubGlobal("navigator", {
			geolocation: {
				getCurrentPosition: getCurrentPositionMock,
				watchPosition: watchPositionMock,
				clearWatch: clearWatchMock,
			},
			permissions: {
				query: queryPermissionMock,
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("continues tracking after the first prompted location fix", async () => {
		const promptPermission = {
			state: "prompt",
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};
		const grantedPermission = {
			state: "granted",
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};

		queryPermissionMock
			.mockResolvedValueOnce(promptPermission)
			.mockResolvedValueOnce(grantedPermission);
		watchPositionMock.mockReturnValue(77);
		getCurrentPositionMock.mockImplementation((onSuccess) => {
			onSuccess({
				coords: {
					latitude: 13.7563,
					longitude: 100.5018,
					accuracy: 18,
					heading: null,
					speed: null,
					altitude: null,
				},
			});
		});

		const store = useLocationStore();
		const coords = await store.getCurrentPosition({
			allowPrompt: true,
			continueTracking: true,
		});

		expect(coords).toEqual([13.7563, 100.5018]);
		expect(store.userLocation).toEqual([13.7563, 100.5018]);
		expect(store.isMockLocation).toBe(false);
		expect(store.permissionStatus).toBe("granted");
		expect(watchPositionMock).toHaveBeenCalledTimes(1);
		expect(store.isTracking).toBe(true);
	});
});
