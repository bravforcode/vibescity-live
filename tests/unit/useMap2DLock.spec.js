import { describe, expect, it, vi } from "vitest";
import {
	LOCKED_2D_CAMERA,
	useMap2DLock,
	withLocked2DCamera,
} from "../../src/composables/map/useMap2DLock";

const createMockMap = () => {
	const listeners = new Map();
	const on = vi.fn((event, handler) => {
		listeners.set(event, handler);
	});
	const off = vi.fn((event) => {
		listeners.delete(event);
	});
	return {
		on,
		off,
		listeners,
		dragRotate: { disable: vi.fn() },
		touchZoomRotate: { disableRotation: vi.fn() },
		keyboard: { disableRotation: vi.fn() },
		setMaxPitch: vi.fn(),
		setMinPitch: vi.fn(),
		setPitch: vi.fn(),
		setBearing: vi.fn(),
		getPitch: vi.fn(() => 14),
		getBearing: vi.fn(() => 19),
	};
};

describe("useMap2DLock", () => {
	it("forces pitch/bearing to 0 and disables rotation controls", () => {
		const map = createMockMap();
		const mapRef = { value: map };
		const { bind2DLock, enforce2D } = useMap2DLock(mapRef, { enabled: true });

		bind2DLock();
		enforce2D();

		expect(map.dragRotate.disable).toHaveBeenCalled();
		expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
		expect(map.keyboard.disableRotation).toHaveBeenCalled();
		expect(map.setMaxPitch).toHaveBeenCalledWith(0);
		expect(map.setMinPitch).toHaveBeenCalledWith(0);
		expect(map.setPitch).toHaveBeenCalledWith(LOCKED_2D_CAMERA.pitch);
		expect(map.setBearing).toHaveBeenCalledWith(LOCKED_2D_CAMERA.bearing);
	});

	it("does nothing when disabled", () => {
		const map = createMockMap();
		const mapRef = { value: map };
		const { enforce2D } = useMap2DLock(mapRef, { enabled: false });
		enforce2D();
		expect(map.dragRotate.disable).not.toHaveBeenCalled();
		expect(map.setPitch).not.toHaveBeenCalled();
	});

	it("applies immutable locked camera options", () => {
		const options = withLocked2DCamera({ zoom: 14, pitch: 55, bearing: 33 });
		expect(options.zoom).toBe(14);
		expect(options.pitch).toBe(0);
		expect(options.bearing).toBe(0);
	});
});
