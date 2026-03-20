import { supabase } from "../lib/supabase";
import {
	logUnexpectedSupabaseReadError,
	runSupabaseReadPolicy,
} from "../utils/supabaseReadPolicy";

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
		return await runSupabaseReadPolicy({
			resourceType: "nearbyDiscovery",
			run: async () => {
				const { data, error } = await supabase.rpc("search_venues", {
					p_query: "",
					p_lat: lat,
					p_lng: lng,
					p_radius_km: radius / 1000,
				});

				if (error) throw error;
				return data || [];
			},
		});
	} catch (err) {
		logUnexpectedSupabaseReadError(
			"[GeoService] Failed to fetch nearby shops:",
			err,
		);
		return [];
	}
}

/**
 * Bounds-based query for map viewports
 */
export async function getShopsInBounds(minLat, minLng, maxLat, maxLng) {
	try {
		const centerLat = (minLat + maxLat) / 2;
		const centerLng = (minLng + maxLng) / 2;

		return await runSupabaseReadPolicy({
			resourceType: "nearbyDiscovery",
			run: async () => {
				const { data, error } = await supabase.rpc("search_venues", {
					p_query: "",
					p_lat: centerLat,
					p_lng: centerLng,
					p_radius_km: 50,
				});

				if (error) throw error;
				return data || [];
			},
		});
	} catch (err) {
		logUnexpectedSupabaseReadError(
			"[GeoService] Failed to fetch shops in bounds:",
			err,
		);
		return [];
	}
}
