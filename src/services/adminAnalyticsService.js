import { getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
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

export const adminAnalyticsService = {
	async getUsageDashboard(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-analytics-dashboard`, {
			method: "POST",
			headers,
			body: JSON.stringify(filters),
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => ({}));
			throw new Error(payload?.error || "Failed to fetch analytics dashboard");
		}
		return await res.json();
	},

	async exportUsage(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-analytics-export`, {
			method: "POST",
			headers,
			body: JSON.stringify(filters),
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => ({}));
			throw new Error(payload?.error || "Failed to export analytics");
		}
		return await res.blob();
	},
};
