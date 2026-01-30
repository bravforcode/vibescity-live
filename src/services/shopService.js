import { supabase } from "../lib/supabase";

/**
 * Maps Supabase Postgres data to the internal shop object format.
 * This ensures the UI doesn't break even if DB column names differ from CSV headers.
 */
const mapShopData = (item, index) => {
	const img1 = item.image_url_1 || item.Image_URL1 || "";
	const img2 = item.image_url_2 || item.Image_URL2 || "";

	return {
		id: item.id || index,
		name: item.name || "",
		category: item.category || "General",
		lat: parseFloat(item.latitude || item.Latitude || 0),
		lng: parseFloat(item.longitude || item.Longitude || 0),
		videoUrl: item.video_url || item.Video_URL || "",

		// Status logic
		originalStatus: (item.status || item.Status || "").toUpperCase(),
		status: (item.status || item.Status || "OFF").toUpperCase(),

		vibeTag: item.vibe_info || item.Vibe_Info || "",
		crowdInfo: item.crowd_info || item.Crowd_Info || "",

		promotionInfo: item.promotion_info || item.Promotion_info || "",
		promotionEndtime: item.promotion_endtime || item.Promotion_endtime || "",

		// Time Ranges
		openTime: item.open_time || "",
		closeTime: item.close_time || "",
		goldenStart: item.golden_time || "",
		goldenEnd: item.end_golden_time || "",

		// Zone & Building
		Province: item.province || item.Province || "เชียงใหม่",
		Zone: item.zone || item.Zone || null,
		Building: item.building || item.Building || null,
		Floor: item.floor || item.Floor || null,
		CategoryColor: item.category_color || item.CategoryColor || null,

		images: [img1, img2].filter((url) => url && url.length > 5),
		Image_URL1: img1,
		Image_URL2: img2,

		// Socials
		IG_URL: item.ig_url || item.IG_URL || "",
		FB_URL: item.fb_url || item.FB_URL || "",
		TikTok_URL: item.tiktok_url || item.TikTok_URL || "",
		isPromoted:
			String(item.is_promoted || item.IsPromoted).toUpperCase() === "TRUE",
	};
};

export const getShops = async (province = "ทุกจังหวัด") => {
	try {
		let query = supabase.from("shops").select("*");

		if (province && province !== "ทุกจังหวัด") {
			query = query.eq("province", province);
		}

		const { data, error } = await query;

		if (error) throw error;

		return (data || []).map((item, index) => mapShopData(item, index));
	} catch (error) {
		console.error("Error fetching shops from Supabase:", error);
		throw new Error("Unable to load data from Supabase");
	}
};

/**
 * Nationwide LIVE status
 */
export const getLiveEverywhere = async () => {
	try {
		const { data, error } = await supabase
			.from("shops")
			.select("*")
			.eq("status", "LIVE");

		if (error) throw error;
		return (data || []).map((item, index) => mapShopData(item, index));
	} catch (err) {
		console.error("Error fetching live everywhere:", err);
		return [];
	}
};

/**
 * Buildings (Floor Plans & POIs)
 */
export const getBuildings = async () => {
	try {
		const { data, error } = await supabase.from("buildings").select("*");

		if (error) throw error;

		// Convert array back to keyed object structure
		const buildingsMap = {};
		data.forEach((b) => {
			buildingsMap[b.id] = {
				...b.data,
				id: b.id,
				name: b.name,
			};
		});
		return buildingsMap;
	} catch (error) {
		console.error("Error fetching buildings:", error);
		return {};
	}
};

/**
 * Global Review System
 */
export const getReviews = async (shopId) => {
	try {
		const { data, error } = await supabase
			.from("reviews")
			.select("*")
			.eq("shop_id", shopId)
			.order("created_at", { ascending: false });

		if (error) {
			// Suppress missing table error
			if (
				error.code === "PGRST205" ||
				error.message.includes("find the table")
			) {
				console.warn("Reviews table not found, skipping.");
				return [];
			}
			throw error;
		}
		return data;
	} catch (error) {
		// Only suppress missing table errors, re-throw other errors
		if (
			error.code === "PGRST205" ||
			error.message?.includes("find the table")
		) {
			console.warn("Review fetch skipped:", error.message);
			return [];
		}
		throw error;
	}
};

export const postReview = async (shopId, review) => {
	try {
		const { data, error } = await supabase
			.from("reviews")
			.insert([
				{
					shop_id: shopId,
					user_name: review.userName || "Anonymous",
					rating: review.rating,
					comment: review.comment,
				},
			])
			.select();

		if (error) throw error;
		return data[0];
	} catch (error) {
		console.error("Error posting review:", error);
		throw error;
	}
};

/**
 * Real-time subscription helper (Optional enhancement)
 */
export const subscribeToShopUpdates = (callback) => {
	return supabase
		.channel("public:table_updates")
		.on(
			"postgres_changes",
			{ event: "*", schema: "public", table: "shops" },
			(payload) => {
				callback({ type: "shop", payload });
			},
		)
		.on(
			"postgres_changes",
			{ event: "INSERT", schema: "public", table: "reviews" },
			(payload) => {
				callback({ type: "review", payload });
			},
		)
		.subscribe();
};
