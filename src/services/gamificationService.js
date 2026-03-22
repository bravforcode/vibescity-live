import { supabase } from "../lib/supabase";

/**
 * Get or create a persistent visitor ID for anonymous users.
 * Falls back to a UUID stored in localStorage so gamification
 * works without login/register.
 */
const getVisitorId = () => {
	try {
		let vid = localStorage.getItem("vibe_visitor_id");
		if (!vid) {
			vid = crypto.randomUUID();
			localStorage.setItem("vibe_visitor_id", vid);
		}
		return vid;
	} catch {
		return crypto.randomUUID();
	}
};

/**
 * Returns the authenticated user ID if logged in,
 * otherwise returns the anonymous visitor ID.
 */
const getUserOrVisitorId = async () => {
	try {
		const {
			data: { user },
		} = await supabase.auth.getUser();
		if (user?.id) return { userId: user.id, isAuth: true };
	} catch {
		// Not logged in — use visitor ID
	}
	return { userId: getVisitorId(), isAuth: false };
};

const AUTH_REQUIRED_MESSAGE = "Please sign in to use this feature.";

const unwrapRpcData = (data) => {
	if (Array.isArray(data)) return data[0] || {};
	return data || {};
};

export const gamificationService = {
	async getDailyCheckinStatus() {
		const { userId } = await getUserOrVisitorId();

		const { data, error } = await supabase.rpc("get_daily_checkin_status", {
			p_visitor_id: userId,
		});
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async claimDailyCheckin() {
		const { userId } = await getUserOrVisitorId();

		const { data, error } = await supabase.rpc("claim_daily_checkin", {
			p_visitor_id: userId,
		});
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async getLuckyWheelStatus() {
		const { userId } = await getUserOrVisitorId();

		const { data, error } = await supabase.rpc("get_lucky_wheel_status", {
			p_visitor_id: userId,
		});
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async spinLuckyWheel() {
		const { userId } = await getUserOrVisitorId();

		const { data, error } = await supabase.rpc("spin_lucky_wheel", {
			p_visitor_id: userId,
		});
		if (error) throw error;
		return unwrapRpcData(data);
	},

	/**
	 * Claim a vibe for a venue. Routes through FastAPI (not direct Supabase)
	 * so that IP-hash rate limiting (SAFE-01) is enforced server-side.
	 * Returns: { already_claimed, coins_awarded, balance, total_earned }
	 * or: { already_claimed: false, rate_limited: true, balance: null }
	 */
	async claimVibe(venueId) {
		const { userId } = await getUserOrVisitorId();
		const apiBase = import.meta.env.VITE_API_URL || "";
		const response = await fetch(`${apiBase}/v1/gamification/claim`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ venue_id: venueId, visitor_id: userId }),
		});
		if (response.status === 429) {
			return { already_claimed: false, rate_limited: true, balance: null };
		}
		if (!response.ok) {
			throw new Error(`Claim failed: ${response.status}`);
		}
		return response.json();
	},

	/**
	 * Fetch all of today's claimed venue IDs + current coin balance for this visitor.
	 * Used on page load to sync server state (GAME-06) and for MAP-02 glow rings.
	 * Returns: { balance, venue_ids }
	 */
	async getMyClaimsFromServer() {
		const { userId } = await getUserOrVisitorId();
		const apiBase = import.meta.env.VITE_API_URL || "";
		const response = await fetch(
			`${apiBase}/v1/gamification/my-claims?visitor_id=${encodeURIComponent(userId)}`,
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch claims: ${response.status}`);
		}
		return response.json();
	},
};

export { AUTH_REQUIRED_MESSAGE, getUserOrVisitorId, getVisitorId };
