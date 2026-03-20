/**
 * Admin Data Service — Direct Supabase queries for dashboard
 * Provides paginated, filterable access to all tables
 */
import { supabase } from "../lib/supabase";
import {
	isSoftSupabaseReadError,
	logUnexpectedSupabaseReadError,
	runSupabaseReadPolicy,
} from "../utils/supabaseReadPolicy";

const DEFAULT_PAGE_SIZE = 25;

const buildEmptyPage = (page, pageSize) => ({
	rows: [],
	total: 0,
	page,
	pageSize,
	totalPages: 0,
});

const runAdminRead = async ({
	label,
	run,
	fallback,
	throwUnexpected = false,
}) => {
	try {
		return await runSupabaseReadPolicy({
			resourceType: "adminRead",
			run,
		});
	} catch (error) {
		if (isSoftSupabaseReadError(error)) {
			return typeof fallback === "function" ? fallback(error) : fallback;
		}
		if (import.meta.env.DEV) {
			logUnexpectedSupabaseReadError(
				`[adminDataService] ${label} failed:`,
				error,
			);
		}
		if (throwUnexpected) throw error;
		return typeof fallback === "function" ? fallback(error) : fallback;
	}
};

const safeCount = async (table, filters = {}) =>
	await runAdminRead({
		label: `count ${table}`,
		fallback: 0,
		run: async () => {
			let q = supabase.from(table).select("*", { count: "exact", head: true });
			for (const [col, val] of Object.entries(filters)) {
				if (val !== undefined && val !== null && val !== "") {
					q = q.eq(col, val);
				}
			}
			const { count, error } = await q;
			if (error) throw error;
			return count || 0;
		},
	});

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

	return await runAdminRead({
		label: `query ${table}`,
		fallback: buildEmptyPage(page, pageSize),
		run: async () => {
			let q = supabase
				.from(table)
				.select(select, { count: "exact" })
				.order(orderBy, { ascending })
				.range(from, to);

			for (const [col, val] of Object.entries(filters)) {
				if (val !== undefined && val !== null && val !== "") {
					q = q.eq(col, val);
				}
			}

			if (search && searchColumns.length > 0) {
				const orClauses = searchColumns
					.map((col) => `${col}.ilike.%${search}%`)
					.join(",");
				q = q.or(orClauses);
			}

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
		},
	});
};

const readAdminCollection = async ({ label, fallback, run }) =>
	await runAdminRead({
		label,
		fallback,
		run,
	});

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
		totalRevenue,
		totalCoins,
	] = await Promise.all([
		safeCount("venues"),
		safeCount("visitor_sessions"),
		safeCount("orders"),
		safeCount("reviews"),
		safeCount("local_ads"),
		safeCount("visitor_gamification_stats"),
		readAdminCollection({
			label: "orders revenue",
			fallback: 0,
			run: async () => {
				const { data, error } = await supabase
					.from("orders")
					.select("amount")
					.eq("status", "paid");
				if (error) throw error;
				return (data || []).reduce(
					(sum, row) => sum + (Number(row.amount) || 0),
					0,
				);
			},
		}),
		readAdminCollection({
			label: "coin balances",
			fallback: 0,
			run: async () => {
				const { data, error } = await supabase
					.from("visitor_gamification_stats")
					.select("balance");
				if (error) throw error;
				return (data || []).reduce(
					(sum, row) => sum + (Number(row.balance) || 0),
					0,
				);
			},
		}),
	]);

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
const getVenuesByCategory = async () =>
	await readAdminCollection({
		label: "venues by category",
		fallback: [],
		run: async () => {
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
		},
	});

const getReviewRatingDistribution = async () =>
	await readAdminCollection({
		label: "review rating distribution",
		fallback: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
		run: async () => {
			const { data, error } = await supabase.from("reviews").select("rating");
			if (error) throw error;
			const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			(data || []).forEach((r) => {
				const rating = Math.round(Number(r.rating) || 0);
				if (rating >= 1 && rating <= 5) dist[rating]++;
			});
			return dist;
		},
	});

const getOrderStatusBreakdown = async () =>
	await readAdminCollection({
		label: "order status breakdown",
		fallback: {},
		run: async () => {
			const { data, error } = await supabase.from("orders").select("status");
			if (error) throw error;
			const counts = {};
			(data || []).forEach((r) => {
				const s = r.status || "unknown";
				counts[s] = (counts[s] || 0) + 1;
			});
			return counts;
		},
	});

const getVisitorGeoDistribution = async () =>
	await readAdminCollection({
		label: "visitor geo distribution",
		fallback: [],
		run: async () => {
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
		},
	});

const getVisitorDeviceDistribution = async () =>
	await readAdminCollection({
		label: "visitor device distribution",
		fallback: [],
		run: async () => {
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
		},
	});

const getOrderRevenueTrend = async () =>
	await readAdminCollection({
		label: "order revenue trend",
		fallback: [],
		run: async () => {
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
		},
	});

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
