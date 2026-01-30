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
export async function getNearbyShops(lat, lng, radius = 5000, categories = []) {
    try {
        const { data, error } = await supabase.rpc("get_nearby_shops", {
            lat_param: lat,
            lng_param: lng,
            radius_meters: radius,
            filter_categories: categories.length > 0 ? categories : null
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
        const { data, error } = await supabase.rpc("get_shops_in_bounds", {
            min_lat: minLat,
            min_lng: minLng,
            max_lat: maxLat,
            max_lng: maxLng
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error("[GeoService] Failed to fetch shops in bounds:", err);
        return null;
    }
}
