import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";

const getHeaders = async () => {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${session?.access_token || ""}`,
	};
};

export const redemptionService = {
	async claimCoupon(couponId) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${apiBase}/redemption/claim/${couponId}`, {
			method: "POST",
			headers,
		});

		const data = await res.json();
		if (!res.ok) throw new Error(data.detail || "Failed to claim coupon");
		return data; // { success: true, message: "..." }
	},
};
