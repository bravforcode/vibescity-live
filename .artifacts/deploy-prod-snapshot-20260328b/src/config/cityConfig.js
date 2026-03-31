/**
 * Centralised city / map defaults.
 * Every component that needs map-centre coordinates MUST import from here
 * instead of hard-coding lat/lng values.
 */

export const CITY_DEFAULTS = Object.freeze({
	thailand: {
		lat: 15.87,
		lng: 100.9925,
		label: "Thailand",
		currency: "THB",
		province: "Thailand",
		defaultZoom: 6.1,
		bounds: { south: 5.5, west: 97.2, north: 20.9, east: 105.8 },
	},
	// Chiang Mai – primary deployment city
	chiangMai: {
		lat: 18.7883,
		lng: 98.9853,
		label: "Chiang Mai",
		currency: "THB",
		province: "Chiang Mai",
		defaultZoom: 13.5,
		bounds: { south: 18.75, west: 98.95, north: 18.83, east: 99.05 },
	},
	// Bangkok – fallback / ads default
	bangkok: {
		lat: 13.7563,
		lng: 100.5018,
		label: "Bangkok",
		province: "Bangkok",
		defaultZoom: 12.5,
	},
});

/** The city used as the map default when no user location is available. */
export const DEFAULT_CITY = CITY_DEFAULTS.thailand;

/** Default centre for local-ad targeting when no geo is selected. */
export const DEFAULT_AD_CENTER = CITY_DEFAULTS.thailand;
