import { getSupabaseEdgeBaseUrl } from "../lib/runtimeConfig";
import {
	getAdminAuthHeaders,
	requestAdminBlob,
	requestAdminJson,
} from "./adminRequestPolicy";

const PII_UNAUTHORIZED_MESSAGE =
	"Unauthorized (ตรวจ PIN หรือสิทธิ์ admin/pii_audit_viewer)";

export const adminPiiAuditService = {
	async getDashboard(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminJson({
			url: `${edgeUrl}/admin-pii-audit-dashboard`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ ...filters, pin }),
			},
			fallbackMessage: "Failed to fetch PII audit dashboard",
			unauthorizedMessage: PII_UNAUTHORIZED_MESSAGE,
		});
	},

	async exportCsv(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminBlob({
			url: `${edgeUrl}/admin-pii-audit-export`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ ...filters, pin }),
			},
			fallbackMessage: "Failed to export PII audit",
			unauthorizedMessage: PII_UNAUTHORIZED_MESSAGE,
		});
	},

	async exportAccessLog(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getAdminAuthHeaders();
		return await requestAdminBlob({
			url: `${edgeUrl}/admin-pii-audit-access-export`,
			init: {
				method: "POST",
				headers,
				body: JSON.stringify({ ...filters, pin }),
			},
			fallbackMessage: "Failed to export PII access log",
			unauthorizedMessage: PII_UNAUTHORIZED_MESSAGE,
		});
	},
};
