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
};

export { AUTH_REQUIRED_MESSAGE, getUserOrVisitorId, getVisitorId };
