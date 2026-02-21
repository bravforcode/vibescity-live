import { supabase } from "@/lib/supabase";

/**
 * Service for managing geofenced local ads.
 * Provides CRUD + location-based retrieval through the Supabase `get_local_ads` RPC.
 */
class LocalAdService {
	/* ───────── read ───────── */

	/** Fetch ads that fall within range of a given lat/lng. */
	async getByLocation(lat, lng) {
		const { data, error } = await supabase.rpc("get_local_ads", {
			p_lat: lat,
			p_lng: lng,
		});
		if (error) throw error;
		return data || [];
	}

	/** Fetch all ads (admin). */
	async getAll() {
		const { data, error } = await supabase
			.from("local_ads")
			.select("*")
			.order("created_at", { ascending: false });
		if (error) throw error;
		return data || [];
	}

	/** Fetch a single ad by ID. */
	async getById(id) {
		const { data, error } = await supabase
			.from("local_ads")
			.select("*")
			.eq("id", id)
			.single();
		if (error) throw error;
		return data;
	}

	/* ───────── write ───────── */

	/**
	 * Create a new ad.
	 * @param {{ title:string, description?:string, image_url?:string, link_url?:string, lat:number, lng:number, radius_km?:number, starts_at?:string, ends_at?:string }} payload
	 */
	async create(payload) {
		const { lat, lng, ...rest } = payload;
		const record = {
			...rest,
			location: `POINT(${lng} ${lat})`, // WKT
			radius_km: payload.radius_km ?? 5,
		};
		const { data, error } = await supabase
			.from("local_ads")
			.insert(record)
			.select()
			.single();
		if (error) throw error;
		return data;
	}

	/**
	 * Update an existing ad.
	 * @param {string} id
	 * @param {object} payload - fields to update; lat/lng handled like create.
	 */
	async update(id, payload) {
		const record = { ...payload };
		if (payload.lat !== undefined && payload.lng !== undefined) {
			record.location = `POINT(${payload.lng} ${payload.lat})`;
			delete record.lat;
			delete record.lng;
		}
		const { data, error } = await supabase
			.from("local_ads")
			.update(record)
			.eq("id", id)
			.select()
			.single();
		if (error) throw error;
		return data;
	}

	/** Toggle ad status between 'active' and 'paused'. */
	async toggleStatus(id, currentStatus) {
		const newStatus = currentStatus === "active" ? "paused" : "active";
		return this.update(id, { status: newStatus });
	}

	/** Delete an ad by ID. */
	async remove(id) {
		const { error } = await supabase.from("local_ads").delete().eq("id", id);
		if (error) throw error;
		return true;
	}
}

export const localAdService = new LocalAdService();
