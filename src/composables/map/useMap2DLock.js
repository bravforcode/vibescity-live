import { getCurrentInstance, onUnmounted } from "vue";

export const LOCKED_2D_CAMERA = Object.freeze({
	pitch: 0,
	bearing: 0,
});

const resolveEnabled = (enabled) =>
	typeof enabled === "function" ? Boolean(enabled()) : Boolean(enabled);

export const withLocked2DCamera = (options = {}) => ({
	...(options || {}),
	pitch: LOCKED_2D_CAMERA.pitch,
	bearing: LOCKED_2D_CAMERA.bearing,
});

export function useMap2DLock(mapRef, { enabled = true } = {}) {
	let isBound = false;
	let isApplying = false;

	const enforce2D = () => {
		if (!resolveEnabled(enabled)) return;
		const map = mapRef?.value;
		if (!map || isApplying) return;
		isApplying = true;
		try {
			map.dragRotate?.disable?.();
			map.touchZoomRotate?.disableRotation?.();
			map.keyboard?.disableRotation?.();
			map.setMaxPitch?.(0);
			map.setMinPitch?.(0);
			if (Math.abs(Number(map.getPitch?.() || 0)) > 0.001) {
				map.setPitch?.(LOCKED_2D_CAMERA.pitch);
			}
			if (Math.abs(Number(map.getBearing?.() || 0)) > 0.001) {
				map.setBearing?.(LOCKED_2D_CAMERA.bearing);
			}
		} finally {
			isApplying = false;
		}
	};

	const bind2DLock = () => {
		const map = mapRef?.value;
		if (!map || isBound) return;
		isBound = true;
		enforce2D();
		map.on?.("pitch", enforce2D);
		map.on?.("rotate", enforce2D);
		map.on?.("pitchend", enforce2D);
		map.on?.("rotateend", enforce2D);
		map.on?.("style.load", enforce2D);
	};

	const unbind2DLock = () => {
		const map = mapRef?.value;
		if (!map || !isBound) return;
		isBound = false;
		map.off?.("pitch", enforce2D);
		map.off?.("rotate", enforce2D);
		map.off?.("pitchend", enforce2D);
		map.off?.("rotateend", enforce2D);
		map.off?.("style.load", enforce2D);
	};

	if (getCurrentInstance()) {
		onUnmounted(() => {
			unbind2DLock();
		});
	}

	return {
		enforce2D,
		bind2DLock,
		unbind2DLock,
	};
}
