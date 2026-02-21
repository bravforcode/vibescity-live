import { supabase } from "../lib/supabase";

const AUTH_REQUIRED_MESSAGE = "Please sign in to use this feature.";

const ensureAuthenticated = async () => {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) {
		throw new Error(AUTH_REQUIRED_MESSAGE);
	}

	return user;
};

const unwrapRpcData = (data) => {
	if (Array.isArray(data)) return data[0] || {};
	return data || {};
};

export const gamificationService = {
	async getDailyCheckinStatus() {
		await ensureAuthenticated();

		const { data, error } = await supabase.rpc("get_daily_checkin_status");
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async claimDailyCheckin() {
		await ensureAuthenticated();

		const { data, error } = await supabase.rpc("claim_daily_checkin");
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async getLuckyWheelStatus() {
		await ensureAuthenticated();

		const { data, error } = await supabase.rpc("get_lucky_wheel_status");
		if (error) throw error;
		return unwrapRpcData(data);
	},

	async spinLuckyWheel() {
		await ensureAuthenticated();

		const { data, error } = await supabase.rpc("spin_lucky_wheel");
		if (error) throw error;
		return unwrapRpcData(data);
	},
};

export { AUTH_REQUIRED_MESSAGE };
