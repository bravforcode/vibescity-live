import { supabase } from "../lib/supabase";

const IS_E2E = import.meta.env.VITE_E2E === "true";

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
		if (IS_E2E) {
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
		if (IS_E2E) {
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
		if (IS_E2E) {
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
		if (IS_E2E) {
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
};

export { getUserOrVisitorId, getVisitorId };
