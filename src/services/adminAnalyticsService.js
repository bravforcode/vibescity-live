import { getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
import {
	getAdminAuthHeaders,
	requestAdminBlob,
	requestAdminJson,
} from "./adminRequestPolicy";

export const adminAnalyticsService = {
	async getUsageDashboard(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${edgeUrl}/admin-analytics-dashboard`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			fallbackMessage: "Failed to fetch analytics dashboard",
		});
	},

	async exportUsage(filters = {}) {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminBlob({
			url: `${edgeUrl}/admin-analytics-export`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify(filters),
			},
			fallbackMessage: "Failed to export analytics",
		});
	},
};
