export const MAP_CONFIG = Object.freeze({
	style: {
		lockNeon2DSession: true,
	},
	zoom: {
		min: 3,
		max: 22,
		lod: {
			mini: { min: 3, max: 6.9 },
			compact: { min: 7, max: 14.9 },
			full: { min: 15, max: 22 },
		},
		giantPin: {
			aggregate: { max: 14.9 },
			split: { min: 7, max: 14.9 },
		},
	},
	cars: {
		minVisibleZoom: 12,
	},
	modal: {
		reopenCooldownMs: 700,
	},
	errors: {
		tileDedupeWindowMs: 8000,
	},
});

export const MAP_PERF_BUDGET = Object.freeze({
	fpsFloor: 45,
	firstPinVisibleP95Ms: 500,
	modalOpenP95Ms: 200,
	spriteRenderP95Ms: 80,
	layerUpdateP95Ms: 50,
});
