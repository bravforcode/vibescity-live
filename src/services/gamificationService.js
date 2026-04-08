import { shouldBypassDirectBrowserSupabaseReads } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";

const IS_E2E = import.meta.env.VITE_E2E === "true";
const shouldUseLocalGamificationState = () =>
	IS_E2E || shouldBypassDirectBrowserSupabaseReads();

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

// Auth removed — app is fully anonymous

const unwrapRpcData = (data) => {
	if (Array.isArray(data)) return data[0] || {};
	return data || {};
};

const rpcNoArgFallback = new Set();

const isRpcSignatureError = (error) => {
	const code = String(error?.code || "").toUpperCase();
	const message = String(error?.message || "").toLowerCase();
	return (
		code === "PGRST202" ||
		code === "42883" ||
		message.includes("could not find the function")
	);
};

const callGamificationRpc = async (rpcName, params = undefined) => {
	const useNoArg = rpcNoArgFallback.has(rpcName);
	const primary = await supabase.rpc(rpcName, useNoArg ? undefined : params);
	if (!primary.error) return unwrapRpcData(primary.data);

	if (
		!useNoArg &&
		params &&
		Object.keys(params).length > 0 &&
		isRpcSignatureError(primary.error)
	) {
		const fallback = await supabase.rpc(rpcName);
		if (!fallback.error) {
			rpcNoArgFallback.add(rpcName);
			return unwrapRpcData(fallback.data);
		}
	}

	throw primary.error;
};

const E2E_DAILY_KEY = "vibe_e2e_daily_checkin";
const E2E_WHEEL_KEY = "vibe_e2e_lucky_wheel";

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const readE2EDailyState = () => {
	try {
		const raw = localStorage.getItem(E2E_DAILY_KEY);
		if (!raw)
			return { streak: 0, total_days: 0, balance: 0, last_checkin_at: null };
		return JSON.parse(raw);
	} catch {
		return { streak: 0, total_days: 0, balance: 0, last_checkin_at: null };
	}
};

const writeE2EDailyState = (state) => {
	try {
		localStorage.setItem(E2E_DAILY_KEY, JSON.stringify(state));
	} catch {
		// ignore
	}
};

export const gamificationService = {
	async getDailyCheckinStatus() {
		if (shouldUseLocalGamificationState()) {
			const state = readE2EDailyState();
			const today = getTodayIsoDate();
			const lastDate = String(state.last_checkin_at || "").slice(0, 10);
			return {
				...state,
				can_claim_today: lastDate !== today,
			};
		}
		const { userId } = await getUserOrVisitorId();

		return callGamificationRpc("get_daily_checkin_status", {
			p_visitor_id: userId,
		});
	},

	async claimDailyCheckin() {
		if (shouldUseLocalGamificationState()) {
			const today = getTodayIsoDate();
			const state = readE2EDailyState();
			const lastDate = String(state.last_checkin_at || "").slice(0, 10);
			if (lastDate === today) {
				return {
					already_claimed: true,
					streak: Number(state.streak || 0),
					total_days: Number(state.total_days || 0),
					balance: Number(state.balance || 0),
					claimed_at: state.last_checkin_at,
				};
			}
			const reward_coins = 10;
			const next = {
				streak: Number(state.streak || 0) + 1,
				total_days: Number(state.total_days || 0) + 1,
				balance: Number(state.balance || 0) + reward_coins,
				last_checkin_at: new Date().toISOString(),
			};
			writeE2EDailyState(next);
			return {
				already_claimed: false,
				reward_coins,
				streak: next.streak,
				total_days: next.total_days,
				balance: next.balance,
				claimed_at: next.last_checkin_at,
			};
		}
		const { userId } = await getUserOrVisitorId();

		return callGamificationRpc("claim_daily_checkin", {
			p_visitor_id: userId,
		});
	},

	async getLuckyWheelStatus() {
		if (shouldUseLocalGamificationState()) {
			try {
				return JSON.parse(localStorage.getItem(E2E_WHEEL_KEY) || "{}");
			} catch {
				return { can_spin: true, spins_used_today: 0 };
			}
		}
		const { userId } = await getUserOrVisitorId();

		return callGamificationRpc("get_lucky_wheel_status", {
			p_visitor_id: userId,
		});
	},

	async spinLuckyWheel() {
		if (shouldUseLocalGamificationState()) {
			const reward = 25;
			const payload = {
				can_spin: false,
				spins_used_today: 1,
				reward_coins: reward,
			};
			try {
				localStorage.setItem(E2E_WHEEL_KEY, JSON.stringify(payload));
			} catch {
				// ignore
			}
			return payload;
		}
		const { userId } = await getUserOrVisitorId();

		return callGamificationRpc("spin_lucky_wheel", {
			p_visitor_id: userId,
		});
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

export { getUserOrVisitorId, getVisitorId };
