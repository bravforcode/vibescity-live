import { supabase } from "../lib/supabase";
import { apiFetch, parseApiError } from "./apiClient";
import { bootstrapVisitor, getOrCreateVisitorId } from "./visitorIdentity";

const API_SOURCE = "api";
const FALLBACK_SOURCE = "supabase_fallback";
const OWNER_COLUMNS =
	'id,name,category,status,total_views,view_count,rating,pin_type,image_urls,"Image_URL1",open_time,social_links,updated_at,created_at,verified_until,glow_until,boost_until,giant_until,owner_visitor_id';

const ensureVisitor = async (providedVisitorId = "") => {
	const visitorId = String(providedVisitorId || getOrCreateVisitorId()).trim();
	await bootstrapVisitor();
	return visitorId;
};

const isNetworkLikeError = (error) => {
	const message = String(error?.message || "").toLowerCase();
	return (
		message.includes("failed to fetch") ||
		message.includes("networkerror") ||
		message.includes("load failed")
	);
};

const parseDateUtc = (value) => {
	if (!value) return null;
	const text = String(value).trim();
	if (!text) return null;
	const parsed = text.endsWith("Z") ? `${text.slice(0, -1)}+00:00` : text;
	const dt = new Date(parsed);
	return Number.isNaN(dt.getTime()) ? null : dt;
};

const isLiveStatus = (value) =>
	["live", "active"].includes(
		String(value || "")
			.trim()
			.toLowerCase(),
	);

const isPromoted = (row, now) => {
	const pinType = String(row?.pin_type || "")
		.trim()
		.toLowerCase();
	if (pinType === "giant" || pinType === "boost" || pinType === "boosted") {
		return true;
	}
	for (const key of ["giant_until", "boost_until", "glow_until"]) {
		const dt = parseDateUtc(row?.[key]);
		if (dt && dt > now) return true;
	}
	return false;
};

const firstImage = (row) =>
	row?.Image_URL1 ||
	(Array.isArray(row?.image_urls)
		? row.image_urls.find((x) => Boolean(x))
		: null) ||
	null;

const computeCompleteness = (row) => {
	const checks = {
		category: Boolean(row?.category),
		open_time: Boolean(row?.open_time),
		image: Boolean(firstImage(row)),
		social:
			row?.social_links &&
			typeof row.social_links === "object" &&
			!Array.isArray(row.social_links) &&
			Object.values(row.social_links).some((value) => Boolean(value)),
		pin: Boolean(String(row?.pin_type || "").trim()),
	};
	const totalChecks = Object.keys(checks).length || 1;
	const score = Math.round(
		(Object.values(checks).filter(Boolean).length / totalChecks) * 100,
	);
	const missing = Object.entries(checks)
		.filter(([, ok]) => !ok)
		.map(([key]) => key);
	return { score, missing };
};

const withSource = (payload, source) => ({
	...(payload || {}),
	source,
});

const parseApiPayload = async (response, fallbackMessage) => {
	if (!response.ok) {
		const message = await parseApiError(response, fallbackMessage);
		const error = new Error(message);
		error.status = response.status;
		throw error;
	}
	const payload = await response.json();
	return withSource(payload, API_SOURCE);
};

const fallbackEligible = (error) =>
	Number(error?.status || 0) === 404 || isNetworkLikeError(error);

const loadOwnedVenuesFallback = async (visitorId, limit = 400) => {
	const normalizedLimit = Math.min(400, Math.max(1, Number(limit || 400)));
	const ownerColumnCandidates = [
		"owner_visitor_id",
		"visitor_id",
		"visitor_id_uuid",
	];

	let lastError = null;
	for (const column of ownerColumnCandidates) {
		try {
			const { data, error } = await supabase
				.from("venues")
				.select(OWNER_COLUMNS)
				.eq(column, visitorId)
				.order("updated_at", { ascending: false })
				.limit(normalizedLimit);
			if (error) {
				lastError = error;
				continue;
			}
			return Array.isArray(data) ? data : [];
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError) {
		throw new Error(lastError?.message || "Unable to load venues fallback");
	}
	return [];
};

const buildPortfolioFallback = (venues, visitorId) => {
	const now = new Date();
	const ratings = venues
		.map((row) => Number(row?.rating || 0))
		.filter((value) => Number.isFinite(value) && value > 0);

	const expiring_7d = {
		verified_until: 0,
		glow_until: 0,
		boost_until: 0,
		giant_until: 0,
	};
	for (const row of venues) {
		for (const key of Object.keys(expiring_7d)) {
			const dt = parseDateUtc(row?.[key]);
			if (!dt) continue;
			const diff = dt.getTime() - now.getTime();
			if (diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000) {
				expiring_7d[key] += 1;
			}
		}
	}

	return {
		visitor_id: visitorId,
		kpis: {
			venues_total: venues.length,
			venues_live: venues.filter((row) => isLiveStatus(row?.status)).length,
			total_views: venues.reduce(
				(sum, row) => sum + Number(row?.total_views ?? row?.view_count ?? 0),
				0,
			),
			avg_rating:
				ratings.length > 0
					? Number(
							(
								ratings.reduce((sum, value) => sum + value, 0) / ratings.length
							).toFixed(2),
						)
					: 0,
			promoted: venues.filter((row) => isPromoted(row, now)).length,
		},
		expiring_7d,
		updated_at: now.toISOString(),
	};
};

const buildVenuesFallback = (venues) => {
	const now = new Date();
	const rows = venues.map((row) => ({
		id: row?.id,
		name: row?.name,
		category: row?.category,
		status: row?.status,
		rating: Number(row?.rating || 0),
		total_views: Number(row?.total_views ?? row?.view_count ?? 0),
		pin_type: row?.pin_type,
		image: firstImage(row),
		updated_at: row?.updated_at,
		created_at: row?.created_at,
		verified_until: row?.verified_until,
		glow_until: row?.glow_until,
		boost_until: row?.boost_until,
		giant_until: row?.giant_until,
		is_live: isLiveStatus(row?.status),
		is_promoted: isPromoted(row, now),
		completeness: computeCompleteness(row),
	}));
	return { total: rows.length, venues: rows };
};

const buildInsightsFallback = async (venues, days) => {
	const normalizedDays = Number(days) === 7 ? 7 : 30;
	const now = new Date();
	const since = new Date(now.getTime() - normalizedDays * 24 * 60 * 60 * 1000);
	const venueIds = venues
		.map((row) => String(row?.id || "").trim())
		.filter(Boolean);

	const trendMap = new Map();
	for (let offset = 0; offset <= normalizedDays; offset += 1) {
		const dt = new Date(since.getTime() + offset * 24 * 60 * 60 * 1000);
		const key = dt.toISOString().slice(0, 10);
		trendMap.set(key, {
			date: key,
			events: 0,
			active_venues: 0,
			unique_visitors: 0,
		});
	}

	const visitorsByDay = new Map();
	const venuesByDay = new Map();
	let events = [];
	if (venueIds.length > 0) {
		try {
			const { data, error } = await supabase
				.from("analytics_events")
				.select("created_at,venue_id,event_type,session_id,visitor_id,user_id")
				.in("venue_id", venueIds)
				.gte("created_at", since.toISOString())
				.order("created_at", { ascending: true })
				.limit(4000);
			if (!error && Array.isArray(data)) events = data;
		} catch {
			events = [];
		}
	}

	for (const event of events) {
		const dt = parseDateUtc(event?.created_at);
		if (!dt) continue;
		const key = dt.toISOString().slice(0, 10);
		const current = trendMap.get(key);
		if (!current) continue;
		current.events += 1;

		const venueSet = venuesByDay.get(key) || new Set();
		const venueId = String(event?.venue_id || "").trim();
		if (venueId) venueSet.add(venueId);
		venuesByDay.set(key, venueSet);

		const visitorSet = visitorsByDay.get(key) || new Set();
		const visitorKey = String(
			event?.visitor_id || event?.user_id || event?.session_id || "",
		).trim();
		if (visitorKey) visitorSet.add(visitorKey);
		visitorsByDay.set(key, visitorSet);
	}

	const expiring = [];
	for (const venue of venues) {
		for (const key of [
			"verified_until",
			"glow_until",
			"boost_until",
			"giant_until",
		]) {
			const dt = parseDateUtc(venue?.[key]);
			if (!dt) continue;
			if (
				dt >= now &&
				dt.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000
			) {
				expiring.push({
					venue_id: venue.id,
					feature: key,
					at: dt.toISOString(),
				});
			}
		}
	}

	const lowCompleteness = venues.filter(
		(row) => Number(computeCompleteness(row).score || 0) < 60,
	);
	const promotedCount = venues.filter((row) => isPromoted(row, now)).length;
	const actions = [];
	if (venues.length === 0) {
		actions.push({
			type: "onboarding",
			priority: "high",
			label: "Add your first venue",
			description:
				"Create or claim a venue to unlock owner analytics and promotion tools.",
		});
	}
	if (lowCompleteness.length > 0) {
		actions.push({
			type: "content",
			priority: "high",
			label: "Improve venue completeness",
			description: `${lowCompleteness.length} venues are missing core profile fields.`,
		});
	}
	if (expiring.length > 0) {
		actions.push({
			type: "renewal",
			priority: "medium",
			label: "Renew expiring boosts",
			description: `${expiring.length} promotion/verification slots expire in 7 days.`,
		});
	}
	if (venues.length > 0 && promotedCount === 0) {
		actions.push({
			type: "growth",
			priority: "medium",
			label: "Run your first promotion",
			description:
				"No boosted venues detected. Promote a top venue to improve map visibility.",
		});
	}

	const trend = Array.from(trendMap.values()).map((row) => {
		const venueSet = venuesByDay.get(row.date) || new Set();
		const visitorSet = visitorsByDay.get(row.date) || new Set();
		return {
			...row,
			active_venues: venueSet.size,
			unique_visitors: visitorSet.size,
		};
	});
	const uniqueVisitorTotal = new Set(
		Array.from(visitorsByDay.values()).flatMap((set) => Array.from(set)),
	).size;

	return {
		days: normalizedDays,
		summary: {
			events_total: trend.reduce(
				(sum, row) => sum + Number(row.events || 0),
				0,
			),
			unique_visitors_total: uniqueVisitorTotal,
			active_venues_total: venues.length,
		},
		trend,
		actions,
		expiring,
	};
};

const callOwnerApiOrFallback = async ({
	path,
	fallbackMessage,
	fallbackLoader,
}) => {
	try {
		const response = await apiFetch(path, {
			method: "GET",
			includeVisitor: true,
			refreshVisitorTokenIfNeeded: true,
		});
		return await parseApiPayload(response, fallbackMessage);
	} catch (error) {
		if (!fallbackEligible(error)) throw error;
		const payload = await fallbackLoader();
		return withSource(payload, FALLBACK_SOURCE);
	}
};

export const ownerService = {
	async getPortfolio(providedVisitorId = "") {
		const visitorId = await ensureVisitor(providedVisitorId);
		return callOwnerApiOrFallback({
			path: `/owner/portfolio?visitor_id=${encodeURIComponent(visitorId)}`,
			fallbackMessage: "Unable to load owner portfolio",
			fallbackLoader: async () => {
				const venues = await loadOwnedVenuesFallback(visitorId, 400);
				return buildPortfolioFallback(venues, visitorId);
			},
		});
	},

	async getVenues(providedVisitorId = "", limit = 60) {
		const visitorId = await ensureVisitor(providedVisitorId);
		const normalizedLimit = Math.min(200, Math.max(1, Number(limit || 60)));
		return callOwnerApiOrFallback({
			path: `/owner/venues?visitor_id=${encodeURIComponent(visitorId)}&limit=${normalizedLimit}`,
			fallbackMessage: "Unable to load owner venues",
			fallbackLoader: async () => {
				const venues = await loadOwnedVenuesFallback(
					visitorId,
					normalizedLimit,
				);
				return buildVenuesFallback(venues);
			},
		});
	},

	async getInsights(providedVisitorId = "", days = 30) {
		const visitorId = await ensureVisitor(providedVisitorId);
		const normalizedDays = Number(days) === 7 ? 7 : 30;
		return callOwnerApiOrFallback({
			path: `/owner/insights?visitor_id=${encodeURIComponent(visitorId)}&days=${normalizedDays}`,
			fallbackMessage: "Unable to load owner insights",
			fallbackLoader: async () => {
				const venues = await loadOwnedVenuesFallback(visitorId, 400);
				return buildInsightsFallback(venues, normalizedDays);
			},
		});
	},
};
