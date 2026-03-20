export const MAP_SOURCES = Object.freeze({
	PINS: "pins_source",
	DISTANCE_LINE: "distance-line",
	USER_LOCATION: "user-location",
	NEON_ROADS: "neon-roads",
	TRAFFIC_ROADS_LOCAL: "traffic-roads-local",
});

export const MAP_LAYERS = Object.freeze({
	NEON_FULL: "neon-sign-full",
	NEON_COMPACT: "neon-sign-compact",
	NEON_MINI: "neon-sign-mini",
	NEON_SELECTED: "neon-sign-selected-glow",
	NEON_HITBOX: "neon-sign-hitbox",
	NEON_FALLBACK_IMAGE: "neon-sign-fallback",
	GIANT_PIN_COUNT: "giant-pin-count",
	CLUSTERS: "clusters",
	CLUSTER_COUNT: "cluster-count",
	DISTANCE_LINE: "distance-line-layer",
	DISTANCE_LINE_GLOW: "distance-line-glow",
	USER_LOCATION_OUTER: "user-location-outer",
	USER_LOCATION_INNER: "user-location-inner",
	ROAD_CARS_PRIMARY: "road-cars",
	ROAD_CARS_SECONDARY: "road-cars-w",
	ROAD_CARS_TERTIARY: "road-cars-r",
});

export const NEON_SIGN_LAYER_IDS = Object.freeze([
	MAP_LAYERS.NEON_FULL,
	MAP_LAYERS.NEON_COMPACT,
	MAP_LAYERS.NEON_MINI,
]);

export const CAR_LAYER_IDS = Object.freeze([
	MAP_LAYERS.ROAD_CARS_PRIMARY,
	MAP_LAYERS.ROAD_CARS_SECONDARY,
	MAP_LAYERS.ROAD_CARS_TERTIARY,
]);
