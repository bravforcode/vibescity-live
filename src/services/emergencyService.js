// --- C:\vibecity.live\src\services\emergencyService.js ---
// ✅ Emergency Service - Provides nearby hospitals, police stations, and emergency contacts

/**
 * Emergency contacts for Thailand
 */
export const EMERGENCY_CONTACTS = {
	police: {
		name: "Police",
		number: "191",
		icon: "Shield",
	},
	touristPolice: {
		name: "Tourist Police",
		number: "1155",
		icon: "BadgeCheck",
	},
	ambulance: {
		name: "Ambulance",
		number: "1669",
		icon: "Ambulance",
	},
	fire: {
		name: "Fire Department",
		number: "199",
		icon: "Flame",
	},
};

/**
 * Chiang Mai Emergency Locations (Static data - can be fetched from OSM/Google Places API in production)
 */
export const CHIANG_MAI_HOSPITALS = [
	{
		id: "hosp_1",
		name: "Chiang Mai Ram Hospital",
		lat: 18.7836,
		lng: 98.9819,
		phone: "+66 53 920 300",
		type: "hospital",
		open24h: true,
	},
	{
		id: "hosp_2",
		name: "Maharaj Nakorn Chiang Mai Hospital",
		lat: 18.7879,
		lng: 98.9686,
		phone: "+66 53 936 150",
		type: "hospital",
		open24h: true,
	},
	{
		id: "hosp_3",
		name: "Bangkok Hospital Chiang Mai",
		lat: 18.7594,
		lng: 98.9794,
		phone: "+66 53 089 888",
		type: "hospital",
		open24h: true,
	},
	{
		id: "hosp_4",
		name: "Sriphat Medical Center",
		lat: 18.7869,
		lng: 98.9731,
		phone: "+66 53 936 900",
		type: "hospital",
		open24h: true,
	},
];

export const CHIANG_MAI_POLICE = [
	{
		id: "police_1",
		name: "Chiang Mai Police Station",
		lat: 18.7863,
		lng: 98.9939,
		phone: "+66 53 276 041",
		type: "police",
	},
	{
		id: "police_2",
		name: "Tourist Police Chiang Mai",
		lat: 18.7856,
		lng: 98.9887,
		phone: "1155",
		type: "tourist_police",
	},
	{
		id: "police_3",
		name: "Chang Phueak Police Station",
		lat: 18.8068,
		lng: 98.9836,
		phone: "+66 53 211 551",
		type: "police",
	},
];

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
	const R = 6371; // Earth's radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
};

/**
 * Get nearest emergency locations sorted by distance
 */
export const getNearbyEmergency = (userLat, userLng, maxResults = 3) => {
	const allLocations = [...CHIANG_MAI_HOSPITALS, ...CHIANG_MAI_POLICE];

	const withDistance = allLocations.map((loc) => ({
		...loc,
		distance: calculateDistance(userLat, userLng, loc.lat, loc.lng),
	}));

	withDistance.sort((a, b) => a.distance - b.distance);

	return {
		nearest: withDistance.slice(0, maxResults),
		hospitals: withDistance
			.filter((l) => l.type === "hospital")
			.slice(0, maxResults),
		police: withDistance
			.filter((l) => l.type === "police" || l.type === "tourist_police")
			.slice(0, maxResults),
	};
};

/**
 * Generate tel: link for calling
 */
export const getCallLink = (number) => {
	return `tel:${number.replaceAll(/\s+/g, "")}`;
};

/**
 * Generate navigation link to emergency location
 */
export const getDirectionsLink = (lat, lng) => {
	return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
};
