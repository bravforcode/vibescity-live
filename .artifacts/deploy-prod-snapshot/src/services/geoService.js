import { supabase } from "../lib/supabase";

/**
 * Fetches shops within a radius using server-side geospatial query.
 * Requires PostgreSQL PostGIS extension and 'get_nearby_shops' RPC function.
 *
 * @param {number} lat - User latitude
 * @param {number} lng - User longitude
 * @param {number} radius - Radius in meters (default 5000)
 * @param {Array} categories - Optional filter categories
 */
export async function getNearbyShops(
	lat,
	lng,
	radius = 5000,
	_categories = [],
) {
	try {
		// Use v6 'search_venues' RPC
		const { data, error } = await supabase.rpc("search_venues", {
			p_query: "", // No text filter
			p_lat: lat,
			p_lng: lng,
			p_radius_km: radius / 1000,
			// p_limit: 50 // Default is 20 in RPC, maybe increase if needed
		});

		if (error) throw error;
		return data;
	} catch (err) {
		console.error("[GeoService] Failed to fetch nearby shops:", err);
		return null;
	}
}

/**
 * Bounds-based query for map viewports
 */
export async function getShopsInBounds(minLat, minLng, maxLat, maxLng) {
	try {
		// Direct PostGIS query is ideal, but Supabase JS client doesn't support PostGIS bounds natively well without RPC
		// Fallback to lat/lng box query on 'venues' table (using the columns we migrated or views)
		// Ideally we should create an RPC for this, but for now let's query the 'venues' table directly assuming lat/lng availability
		// or using the view 'top_venues_view' if it has lat/lng

		// Note: The v6 script creates 'venues' with 'location' (geography).
		// It does NOT guarantee 'latitude'/'longitude' columns exist on 'venues' (they were in source 'shops').
		// However, we can use the 'user-defined' filter if we had one?
		// Let's use a simple RPC call if we can, or refactor to use 'get_nearby_venues' center point?

		// Let's rely on 'search_venues' with a large radius from center of bounds?
		const centerLat = (minLat + maxLat) / 2;
		const centerLng = (minLng + maxLng) / 2;

		// Approx radius
		const { data, error } = await supabase.rpc("search_venues", {
			p_query: "",
			p_lat: centerLat,
			p_lng: centerLng,
			p_radius_km: 50, // Large enough to cover viewport
		});

		if (error) throw error;
		return data;
	} catch (err) {
		console.error("[GeoService] Failed to fetch shops in bounds:", err);
		return null;
	}
}
