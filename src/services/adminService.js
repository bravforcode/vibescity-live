import { getApiV1BaseUrl, getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
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

export const adminService = {
	async promoteToGiant(shopId, giantCategory, metadata) {
		const { error } = await supabase.rpc("promote_to_giant", {
			p_shop_id: shopId,
			p_giant_category: giantCategory,
			p_metadata: metadata,
		});
		if (error) throw error;
	},

	async listPendingShops() {
		const apiBase = getApiV1BaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${apiBase}/admin/pending/shops`, { headers });
		if (!res.ok) throw new Error("Failed to fetch pending shops");
		return await res.json();
	},

	async approveShop(shopId) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${apiBase}/admin/shops/${shopId}/approve`, {
			method: "POST",
			headers,
		});
		if (!res.ok) throw new Error("Failed to approve shop");
		return await res.json();
	},

	async rejectShop(shopId, reason) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${apiBase}/admin/shops/${shopId}/reject`, {
			method: "POST",
			headers,
			body: JSON.stringify({ reason }),
		});
		if (!res.ok) throw new Error("Failed to reject shop");
		return await res.json();
	},

	async listSlipVerifications(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-slip-dashboard`, {
			method: "POST",
			headers,
			body: JSON.stringify(filters),
		});
		if (!res.ok) throw new Error("Failed to fetch slip verifications");
		return await res.json();
	},

	async exportSlipVerifications(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-slip-export`, {
			method: "POST",
			headers,
			body: JSON.stringify(filters),
		});
		if (!res.ok) throw new Error("Failed to export slip verifications");
		return await res.blob();
	},
};
