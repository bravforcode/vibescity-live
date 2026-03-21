import { supabase } from "../lib/supabase";

/**
 * Normalizes event data from Supabase to internal format
 */
const normalizeEvent = (rawEvent) => {
	return {
		id: rawEvent.id,
		name: rawEvent.name || "Unknown Event",
		shortName: rawEvent.name?.split(" ").slice(0, 3).join(" "),
		lat: parseFloat(rawEvent.lat || 0),
		lng: parseFloat(rawEvent.lng || 0),
		location: rawEvent.location || "",
		category: rawEvent.category || "General",
		startTime: rawEvent.start_time || new Date().toISOString(),
		endTime: rawEvent.end_time || new Date(Date.now() + 86400000).toISOString(),
		status: rawEvent.is_live ? "LIVE" : "UPCOMING",
		description: rawEvent.description || "",
		image: rawEvent.image_url || null,
		icon: getCategoryIcon(rawEvent.category),
		isEvent: true,
		isLive: rawEvent.is_live || false,
	};
};

const getCategoryIcon = (category) => {
	const cat = (category || "").toLowerCase();
	if (cat.includes("music") || cat.includes("concert")) return "🎵";
	if (cat.includes("food") || cat.includes("festival")) return "🍜";
	if (cat.includes("art") || cat.includes("exhibition")) return "🎨";
	if (cat.includes("sport")) return "🏃";
	if (cat.includes("nightlife") || cat.includes("party")) return "💃";
	return "📍";
};

export const fetchRealTimeEvents = async () => {
	try {
		const { data, error } = await supabase
			.from("events")
			.select("*")
			.order("start_time", { ascending: true });

		if (error) throw error;
		return (data || []).map(normalizeEvent);
	} catch (error) {
		if (import.meta.env.DEV) {
			console.error("Supabase Event fetching error:", error);
		}
		return [];
	}
};
