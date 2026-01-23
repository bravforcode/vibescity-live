/**
 * Event Service - Handles fetching real-time events for Thailand
 * Fallback to local events.json if API fails
 */

const LOCAL_EVENTS_URL = "/data/events.json";

/**
 * Normalizes event data from various sources to a standard format
 * @param {Object} rawEvent
 * @returns {Object} Normalized event
 */
const normalizeEvent = (rawEvent) => {
	// Map various API fields to our internal format
	return {
		id: rawEvent.id || Math.random().toString(36).substr(2, 9),
		name: rawEvent.name || rawEvent.title || "Unknown Event",
		shortName:
			rawEvent.shortName || rawEvent.name?.split(" ").slice(0, 3).join(" "),
		lat: parseFloat(rawEvent.lat || rawEvent.venue?.latitude || 0),
		lng: parseFloat(rawEvent.lng || rawEvent.venue?.longitude || 0),
		category: rawEvent.category || "General",
		startTime:
			rawEvent.startTime || rawEvent.start?.local || new Date().toISOString(),
		endTime:
			rawEvent.endTime ||
			rawEvent.end?.local ||
			new Date(Date.now() + 86400000).toISOString(),
		status: rawEvent.status || "UPCOMING",
		description: rawEvent.description || "",
		image: rawEvent.image || rawEvent.logo?.url || null,
		icon: getCategoryIcon(rawEvent.category),
		isEvent: true,
	};
};

/**
 * Returns an emoji based on event category
 */
const getCategoryIcon = (category) => {
	const cat = (category || "").toLowerCase();
	if (cat.includes("music") || cat.includes("concert")) return "🎵";
	if (cat.includes("food") || cat.includes("festival")) return "🍜";
	if (cat.includes("art") || cat.includes("exhibition")) return "🎨";
	if (cat.includes("sport")) return "🏃";
	if (cat.includes("nightlife") || cat.includes("party")) return "💃";
	if (cat.includes("tech")) return "💻";
	return "📍";
};

/**
 * Fetches real-time events
 * @returns {Promise<Array>} List of normalized events
 */
export const fetchRealTimeEvents = async () => {
	try {
		console.log("🔍 Fetching real-time events...");

		// In a production app, you would fetch from an aggregator API or your own backend
		// Example: fetch('https://api.vibecity.live/v1/events/thailand')

		// For now, we fetch from local events.json and simulate real-time injection
		const response = await fetch(LOCAL_EVENTS_URL);
		if (!response.ok) throw new Error("Failed to load local events");

		const data = await response.json();
		return data.map(normalizeEvent);
	} catch (error) {
		console.warn("Event API error, using empty list:", error);
		return [];
	}
};
