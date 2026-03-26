import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { normalizeVenueViewModel } from "../domain/venue/viewModel";
import { getAllEvents } from "../services/eventService";
import { useShopStore } from "../store/shopStore";

const EVENT_FUTURE_WINDOW_DAYS = 14;
const EVENT_PAST_GRACE_HOURS = 12;
const EVENT_CATEGORY_HINTS = [
	"event",
	"festival",
	"concert",
	"market",
	"fair",
	"expo",
	"party",
];

const normalizeText = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();
const toFiniteNumber = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const parseEventTimeWindow = (event) => {
	const startRaw =
		event?.startTime ||
		event?.start_time ||
		event?.startDate ||
		event?.start_date ||
		event?.date;
	if (!startRaw) return null;

	const start = new Date(startRaw);
	if (Number.isNaN(start.getTime())) return null;

	const endRaw =
		event?.endTime || event?.end_time || event?.endDate || event?.end_date;
	const end = endRaw
		? new Date(endRaw)
		: new Date(start.getTime() + 6 * 60 * 60 * 1000);
	if (Number.isNaN(end.getTime())) return null;

	return { start, end };
};

const shouldKeepEventInWindow = (event, now) => {
	const range = parseEventTimeWindow(event);
	if (!range) return false;

	const futureBoundary = new Date(
		now.getTime() + EVENT_FUTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	);
	const pastBoundary = new Date(
		now.getTime() - EVENT_PAST_GRACE_HOURS * 60 * 60 * 1000,
	);
	return range.start <= futureBoundary && range.end >= pastBoundary;
};

const resolveEventCoordinates = (event, buildingsData, venues) => {
	const directLat = toFiniteNumber(event?.lat ?? event?.latitude);
	const directLng = toFiniteNumber(
		event?.lng ?? event?.longitude ?? event?.lon,
	);
	if (directLat !== null && directLng !== null)
		return { lat: directLat, lng: directLng };

	const buildingKey = String(
		event?.buildingId || event?.building_id || event?.building || "",
	).trim();
	if (buildingKey) {
		const directBuilding = buildingsData?.[buildingKey];
		const buildingLat = toFiniteNumber(
			directBuilding?.lat ?? directBuilding?.latitude,
		);
		const buildingLng = toFiniteNumber(
			directBuilding?.lng ?? directBuilding?.longitude,
		);
		if (buildingLat !== null && buildingLng !== null) {
			return { lat: buildingLat, lng: buildingLng };
		}
	}

	const locationText = normalizeText(event?.location || event?.venue || "");
	if (locationText && buildingsData && typeof buildingsData === "object") {
		for (const building of Object.values(buildingsData)) {
			const bName = normalizeText(building?.name || building?.shortName || "");
			if (!bName) continue;
			if (!locationText.includes(bName) && !bName.includes(locationText))
				continue;
			const bLat = toFiniteNumber(building?.lat ?? building?.latitude);
			const bLng = toFiniteNumber(building?.lng ?? building?.longitude);
			if (bLat !== null && bLng !== null) {
				return { lat: bLat, lng: bLng };
			}
		}
	}

	const venueId = String(
		event?.venue_id || event?.venueId || event?.shop_id || "",
	).trim();
	if (venueId) {
		const byId = venues.find(
			(shop) => String(shop?.id ?? "").trim() === venueId,
		);
		if (byId) {
			const lat = toFiniteNumber(byId?.lat ?? byId?.latitude);
			const lng = toFiniteNumber(byId?.lng ?? byId?.longitude);
			if (lat !== null && lng !== null) return { lat, lng };
		}
	}

	const nameHint = normalizeText(event?.name || event?.title || "");
	for (const shop of venues) {
		const lat = toFiniteNumber(shop?.lat ?? shop?.latitude);
		const lng = toFiniteNumber(shop?.lng ?? shop?.longitude);
		if (lat === null || lng === null) continue;
		const shopName = normalizeText(shop?.name);
		const shopAddress = normalizeText(
			shop?.address || shop?.district || shop?.zone,
		);
		if (
			(nameHint &&
				(shopName.includes(nameHint) || nameHint.includes(shopName))) ||
			(locationText &&
				(shopAddress.includes(locationText) ||
					locationText.includes(shopAddress)))
		) {
			return { lat, lng };
		}
	}

	return null;
};

const normalizePrimaryEvent = (event, coords, now, sourceTag) => {
	const normalized = normalizeVenueViewModel(
		{
			...event,
			id: event?.id || `event-${Date.now()}`,
			name: event?.name || event?.title || "Event",
			category: event?.category || "Event",
			lat: coords.lat,
			lng: coords.lng,
			pin_type: "giant",
			is_event: true,
			has_coin: false,
			status: event?.isLive ? "live" : "off",
			video_url: event?.video_url || event?.video || event?.videoUrl,
			Image_URL1:
				event?.Image_URL1 ||
				event?.cover_image ||
				event?.coverImage ||
				event?.image,
		},
		{ userLocation: null, collectedCoinIds: null },
	);

	const range = parseEventTimeWindow(event);
	const isLive = range
		? now >= range.start && now <= range.end
		: Boolean(event?.isLive);

	return {
		...normalized,
		id: String(normalized.id),
		eventId: String(event?.id || normalized.id),
		venueId: event?.venue_id || event?.venueId || null,
		source: sourceTag,
		isEvent: true,
		is_event: true,
		pin_state: "event",
		pin_type: "giant",
		is_live: isLive,
		status: isLive ? "LIVE" : normalized.status,
		startTime:
			range?.start?.toISOString?.() || event?.startTime || event?.date || null,
		endTime: range?.end?.toISOString?.() || event?.endTime || null,
		description: event?.description || normalized.description || "",
		location: event?.location || event?.venue || "",
	};
};

const isVenueEventFallback = (shop) => {
	const pinType = normalizeText(shop?.pin_type || shop?.pinType);
	const category = normalizeText(shop?.category);
	if (shop?.is_event || shop?.isEvent) return true;
	if (pinType === "event" || pinType === "giant") return true;
	if (shop?.is_giant_active || shop?.giantActive || shop?.isGiantPin)
		return true;
	return EVENT_CATEGORY_HINTS.some((hint) => category.includes(hint));
};

const normalizeVenueFallbackEvent = (shop, now) => {
	const normalized = normalizeVenueViewModel(
		{
			...shop,
			is_event: true,
			pin_type: "giant",
			has_coin: false,
		},
		{ userLocation: null, collectedCoinIds: null },
	);
	const isLive =
		normalizeText(shop?.status) === "live" || Boolean(shop?.is_live);

	return {
		...normalized,
		id: `venue-${normalized.id}`,
		eventId: `venue-${normalized.id}`,
		venueId: normalized.id,
		source: "venue-fallback",
		isEvent: true,
		is_event: true,
		pin_state: "event",
		pin_type: "giant",
		is_live: isLive,
		status: isLive ? "LIVE" : normalized.status,
		startTime: now.toISOString(),
		endTime: null,
	};
};

const uniqueEventKey = (event) => {
	const venueId = String(event?.venueId || "").trim();
	if (venueId) return `venue:${venueId}`;
	const eventId = String(event?.eventId || event?.id || "").trim();
	if (eventId) return `event:${eventId}`;
	const lat = Number(event?.lat ?? event?.latitude);
	const lng = Number(event?.lng ?? event?.longitude);
	const name = normalizeText(event?.name);
	if (Number.isFinite(lat) && Number.isFinite(lng)) {
		return `${name}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
	}
	return name || `event:${Math.random()}`;
};

export function useEventLogic() {
	const shopStore = useShopStore();
	const { currentTime, processedShops } = storeToRefs(shopStore);

	const realTimeEvents = ref([]);
	const timedEvents = ref([]);
	const buildingsData = ref({});

	const updateEventsData = async () => {
		try {
			const events = await getAllEvents();
			realTimeEvents.value = Array.isArray(events) ? events : [];
		} catch (err) {
			console.warn("Real-time events sync failed:", err?.message || err);
		}
	};

	const activeEvents = computed(() => {
		const now =
			currentTime.value instanceof Date ? currentTime.value : new Date();
		const venues = Array.isArray(processedShops.value)
			? processedShops.value
			: [];
		const buildings =
			buildingsData.value && typeof buildingsData.value === "object"
				? buildingsData.value
				: {};

		const primary = [];
		for (const event of [
			...(timedEvents.value || []),
			...(realTimeEvents.value || []),
		]) {
			if (!event || !shouldKeepEventInWindow(event, now)) continue;
			const coords = resolveEventCoordinates(event, buildings, venues);
			if (!coords) continue;
			primary.push(normalizePrimaryEvent(event, coords, now, "event-feed"));
		}

		const fallback = venues
			.filter(isVenueEventFallback)
			.filter(
				(shop) =>
					Number.isFinite(Number(shop?.lat)) &&
					Number.isFinite(Number(shop?.lng)),
			)
			.map((shop) => normalizeVenueFallbackEvent(shop, now));

		const merged = new Map();
		for (const event of [...primary, ...fallback]) {
			const key = uniqueEventKey(event);
			if (!merged.has(key)) {
				merged.set(key, event);
				continue;
			}
			const current = merged.get(key);
			if (
				String(current?.source || "") !== "event-feed" &&
				event.source === "event-feed"
			) {
				merged.set(key, event);
			}
		}

		return Array.from(merged.values());
	});

	return {
		realTimeEvents,
		timedEvents,
		buildingsData,
		updateEventsData,
		activeEvents,
	};
}
