import { getApiV1BaseUrl, getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";
import { analyticsService } from "./analyticsService";

export const paymentService = {
	/**
	 * Create Checkout Session
	 * @param {number} shopId
	 * @param {Array<{sku: string, quantity: number}>} items
	 */
	async createCheckoutSession(shopId, items, options = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const {
			data: { session },
		} = await supabase.auth.getSession();
		// if (!session) throw new Error("User must be logged in"); // ✅ Removed strict check for Anon

		const visitorId = localStorage.getItem("vibe_visitor_id"); // ✅ Get Visitor ID
		const returnUrl = window.location.origin + window.location.pathname;
		const sku = items?.[0]?.sku;
		const purchaseMode = options?.purchaseMode || undefined;
		const sanitizePartnerToken = (value) => {
			const raw = String(value || "").trim();
			if (!raw) return "";
			return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
		};
		const readCookie = (name) => {
			try {
				const target = `${name}=`;
				return document.cookie
					.split(";")
					.map((c) => c.trim())
					.find((c) => c.startsWith(target))
					?.slice(target.length);
			} catch {
				return "";
			}
		};
		const explicitPartnerCode = sanitizePartnerToken(
			options?.partnerCode || options?.referralCode,
		);
		const partnerCode =
			explicitPartnerCode ||
			sanitizePartnerToken(localStorage.getItem("vibe_partner_referral_code"));
		const partnerRef = sanitizePartnerToken(
			localStorage.getItem("vibe_partner_ref") ||
				readCookie("vibe_partner_ref"),
		);
		if (explicitPartnerCode) {
			localStorage.setItem("vibe_partner_referral_code", explicitPartnerCode);
		}

		// Fire-and-forget: never block checkout on analytics.
		try {
			if (sku) {
				void analyticsService.trackEvent(
					"checkout_start",
					{ sku, provider: "stripe" },
					shopId,
				);
			}
		} catch {
			// ignore
		}

		const res = await fetch(`${edgeUrl}/create-checkout-session`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: session ? `Bearer ${session.access_token}` : "", // Optional Bearer
			},
			body: JSON.stringify({
				venue_id: shopId, // Mapped locally
				sku, // Simplified for single item
				purchase_mode: purchaseMode,
				partner_ref: partnerRef || undefined,
				partner_code: partnerCode || undefined,
				visitor_id: visitorId, // ✅ Pass Visitor ID
				return_url: returnUrl,
			}),
		});

		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.error || "Failed to create checkout session");
		}

		return await res.json(); // { url: "..." }
	},

	/**
	 * Poll Order Status
	 * @param {string} sessionId
	 */
	async getOrderStatus(sessionId) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) return { status: "unknown" };
		const lookupId = String(sessionId || "").trim();
		if (!lookupId) return { status: "unknown" };

		const res = await fetch(`${edgeUrl}/get-order-status`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify({
				session_id: lookupId,
				// Backward compatibility for one release cycle.
				orderId: lookupId,
			}),
		});

		if (!res.ok) return { status: "unknown" };
		return await res.json(); // { status: "paid" | "pending" ... }
	},

	/**
	 * Submit Manual Order with Slip
	 */
	async createManualOrder(payload) {
		const apiBase = getApiV1BaseUrl();
		// payload: { venue_id, sku, amount, slip_url, consent_personal_data, buyer_profile, metadata }
		const visitorId = localStorage.getItem("vibe_visitor_id");

		const res = await fetch(`${apiBase}/payments/manual-order`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				...payload,
				visitor_id: visitorId,
			}),
		});

		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.detail || err.error || "Failed to submit order");
		}
		const result = await res.json();

		// Fire-and-forget: never block order creation on analytics.
		try {
			void analyticsService.trackEvent(
				"manual_order_submitted",
				{
					sku: payload?.sku,
					amount: payload?.amount,
					provider: "manual_transfer",
				},
				payload?.venue_id,
			);
		} catch {
			// ignore
		}

		return result;
	},

	/**
	 * Fetch user's orders (Protected by RLS via Visitor ID)
	 */
	async getMyOrders() {
		const { data, error } = await supabase
			.from("orders")
			.select("*")
			.order("created_at", { ascending: false });

		if (error) {
			console.error("Error fetching orders:", error);
			return [];
		}
		return data;
	},
};
