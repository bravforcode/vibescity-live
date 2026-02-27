/**
 * Admin Data Service — Direct Supabase queries for dashboard
 * Provides paginated, filterable access to all tables
 */
import { supabase } from "../lib/supabase";

const DEFAULT_PAGE_SIZE = 25;

const safeCount = async (table, filters = {}) => {
	try {
		let q = supabase.from(table).select("*", { count: "exact", head: true });
		for (const [col, val] of Object.entries(filters)) {
			if (val !== undefined && val !== null && val !== "") {
				q = q.eq(col, val);
			}
		}
		const { count, error } = await q;
		if (error) throw error;
		return count || 0;
	} catch {
		return 0;
	}
};

// ═══════════════════════════════════════
// Generic paginated query
// ═══════════════════════════════════════
const queryTable = async (
	table,
	{
		page = 1,
		pageSize = DEFAULT_PAGE_SIZE,
		orderBy = "created_at",
		ascending = false,
		filters = {},
		search = "",
		searchColumns = [],
		select = "*",
		dateRange = null,
		dateColumn = "created_at",
	} = {},
) => {
	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;

	let q = supabase
		.from(table)
		.select(select, { count: "exact" })
		.order(orderBy, { ascending })
		.range(from, to);

	// Apply equality filters
	for (const [col, val] of Object.entries(filters)) {
		if (val !== undefined && val !== null && val !== "") {
			q = q.eq(col, val);
		}
	}

	// Apply text search (ilike on multiple columns)
	if (search && searchColumns.length > 0) {
		const orClauses = searchColumns
			.map((col) => `${col}.ilike.%${search}%`)
			.join(",");
		q = q.or(orClauses);
	}

	// Apply date range
	if (dateRange?.from) {
		q = q.gte(dateColumn, dateRange.from);
	}
	if (dateRange?.to) {
		q = q.lte(dateColumn, dateRange.to);
	}

	const { data, error, count } = await q;
	if (error) throw error;

	return {
		rows: data || [],
		total: count || 0,
		page,
		pageSize,
		totalPages: Math.ceil((count || 0) / pageSize),
	};
};

// ═══════════════════════════════════════
// Overview KPIs
// ═══════════════════════════════════════
const getOverviewKPIs = async () => {
	const [
		venueCount,
		visitorCount,
		orderCount,
		reviewCount,
		adCount,
		gamificationCount,
	] = await Promise.all([
		safeCount("venues"),
		safeCount("visitor_sessions"),
		safeCount("orders"),
		safeCount("reviews"),
		safeCount("local_ads"),
		safeCount("visitor_gamification_stats"),
	]);

	// Revenue sum
	let totalRevenue = 0;
	try {
		const { data } = await supabase
			.from("orders")
			.select("amount")
			.eq("status", "paid");
		if (data) {
			totalRevenue = data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
		}
	} catch {}

	// Total coins distributed
	let totalCoins = 0;
	try {
		const { data } = await supabase
			.from("visitor_gamification_stats")
			.select("balance");
		if (data) {
			totalCoins = data.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
		}
	} catch {}

	return {
		venues: venueCount,
		visitors: visitorCount,
		orders: orderCount,
		reviews: reviewCount,
		ads: adCount,
		gamificationUsers: gamificationCount,
		totalRevenue,
		totalCoins,
	};
};

// ═══════════════════════════════════════
// Table-specific queries
// ═══════════════════════════════════════
const getVenues = (opts) =>
	queryTable("venues", {
		orderBy: "created_at",
		searchColumns: ["name", "category", "city", "province"],
		...opts,
	});

const getVisitorSessions = (opts) =>
	queryTable("visitor_sessions", {
		orderBy: "created_at",
		searchColumns: ["visitor_id", "country", "city", "device_type"],
		...opts,
	});

const getAnalyticsEvents = (opts) =>
	queryTable("analytics_events", {
		orderBy: "created_at",
		searchColumns: ["event_type", "visitor_id"],
		...opts,
	});

const getGamificationStats = (opts) =>
	queryTable("visitor_gamification_stats", {
		orderBy: "updated_at",
		searchColumns: ["visitor_id"],
		...opts,
	});

const getOrders = (opts) =>
	queryTable("orders", {
		orderBy: "created_at",
		searchColumns: ["sku", "venue_id"],
		...opts,
	});

const getAdImpressions = (opts) =>
	queryTable("ad_impressions", {
		orderBy: "created_at",
		searchColumns: ["ad_id", "visitor_id"],
		...opts,
	});

const getAdClicks = (opts) =>
	queryTable("ad_clicks", {
		orderBy: "created_at",
		searchColumns: ["ad_id", "visitor_id"],
		...opts,
	});

const getLocalAds = (opts) =>
	queryTable("local_ads", {
		orderBy: "created_at",
		searchColumns: ["title", "venue_id"],
		...opts,
	});

const getReviews = (opts) =>
	queryTable("reviews", {
		orderBy: "created_at",
		searchColumns: ["comment", "venue_id"],
		...opts,
	});

// ═══════════════════════════════════════
// Aggregations for charts
// ═══════════════════════════════════════
const getVenuesByCategory = async () => {
	try {
		const { data, error } = await supabase.from("venues").select("category");
		if (error) throw error;
		const counts = {};
		(data || []).forEach((r) => {
			const cat = r.category || "unknown";
			counts[cat] = (counts[cat] || 0) + 1;
		});
		return Object.entries(counts)
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value);
	} catch {
		return [];
	}
};

const getReviewRatingDistribution = async () => {
	try {
		const { data, error } = await supabase.from("reviews").select("rating");
		if (error) throw error;
		const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
		(data || []).forEach((r) => {
			const rating = Math.round(Number(r.rating) || 0);
			if (rating >= 1 && rating <= 5) dist[rating]++;
		});
		return dist;
	} catch {
		return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	}
};

const getOrderStatusBreakdown = async () => {
	try {
		const { data, error } = await supabase.from("orders").select("status");
		if (error) throw error;
		const counts = {};
		(data || []).forEach((r) => {
			const s = r.status || "unknown";
			counts[s] = (counts[s] || 0) + 1;
		});
		return counts;
	} catch {
		return {};
	}
};

const getVisitorGeoDistribution = async () => {
	try {
		const { data, error } = await supabase
			.from("visitor_sessions")
			.select("country");
		if (error) throw error;
		const counts = {};
		(data || []).forEach((r) => {
			const c = r.country || "Unknown";
			counts[c] = (counts[c] || 0) + 1;
		});
		return Object.entries(counts)
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value);
	} catch {
		return [];
	}
};

const getVisitorDeviceDistribution = async () => {
	try {
		const { data, error } = await supabase
			.from("visitor_sessions")
			.select("device_type");
		if (error) throw error;
		const counts = {};
		(data || []).forEach((r) => {
			const d = r.device_type || "Unknown";
			counts[d] = (counts[d] || 0) + 1;
		});
		return Object.entries(counts)
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value);
	} catch {
		return [];
	}
};

const getOrderRevenueTrend = async () => {
	try {
		const { data, error } = await supabase
			.from("orders")
			.select("created_at, amount")
			.eq("status", "paid");
		if (error) throw error;
		const trend = {};
		(data || []).forEach((r) => {
			if (!r.created_at) return;
			const dateStr = r.created_at.split("T")[0];
			trend[dateStr] = (trend[dateStr] || 0) + (Number(r.amount) || 0);
		});
		return Object.entries(trend)
			.map(([date, amount]) => ({ date, amount }))
			.sort((a, b) => a.date.localeCompare(b.date));
	} catch {
		return [];
	}
};

export const adminDataService = {
	queryTable,
	getOverviewKPIs,
	getVenues,
	getVisitorSessions,
	getAnalyticsEvents,
	getGamificationStats,
	getOrders,
	getAdImpressions,
	getAdClicks,
	getLocalAds,
	getReviews,
	getVenuesByCategory,
	getReviewRatingDistribution,
	getOrderStatusBreakdown,
	getVisitorGeoDistribution,
	getVisitorDeviceDistribution,
	getOrderRevenueTrend,
};
