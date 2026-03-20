import { getApiV1BaseUrl, getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";
import {
	getAdminAuthHeaders,
	requestAdminBlob,
	requestAdminJson,
} from "./adminRequestPolicy";

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
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${apiBase}/admin/pending/shops`,
			init: { headers },
			fallbackMessage: "Failed to fetch pending shops",
		});
	},

	async approveShop(shopId) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${apiBase}/admin/shops/${shopId}/approve`,
			init: {
				method: "POST",
				headers,
			},
			fallbackMessage: "Failed to approve shop",
		});
	},

	async rejectShop(shopId, reason) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${apiBase}/admin/shops/${shopId}/reject`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ reason }),
			},
			fallbackMessage: "Failed to reject shop",
		});
	},

	async bulkApproveShops(shopIds) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${apiBase}/admin/shops/bulk-approve`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ shop_ids: shopIds }),
			},
			fallbackMessage: "Failed to approve selected shops",
		});
	},

	async bulkRejectShops(shopIds, reason) {
		const apiBase = getApiV1BaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${apiBase}/admin/shops/bulk-reject`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ shop_ids: shopIds, reason }),
			},
			fallbackMessage: "Failed to reject selected shops",
		});
	},

	async listSlipVerifications(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${edgeUrl}/admin-slip-dashboard`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			fallbackMessage: "Failed to fetch slip verifications",
		});
	},

	async exportSlipVerifications(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminBlob({
			url: `${edgeUrl}/admin-slip-export`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			fallbackMessage: "Failed to export slip verifications",
		});
	},

	async runSheetSync(payload = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${edgeUrl}/admin-sheet-sync`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			},
			fallbackMessage: "Failed to sync Google Sheets",
		});
	},
};
