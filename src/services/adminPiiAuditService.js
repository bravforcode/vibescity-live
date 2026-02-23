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

export const adminPiiAuditService = {
	async getDashboard(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-pii-audit-dashboard`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...filters, pin }),
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => ({}));
			throw new Error(payload?.error || "Failed to fetch PII audit dashboard");
		}
		return await res.json();
	},

	async exportCsv(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-pii-audit-export`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...filters, pin }),
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => ({}));
			throw new Error(payload?.error || "Failed to export PII audit");
		}
		return await res.blob();
	},

	async exportAccessLog(filters = {}, pin = "") {
		const edgeUrl = getSupabaseEdgeBaseUrl();
		const headers = await getHeaders();
		const res = await fetch(`${edgeUrl}/admin-pii-audit-access-export`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...filters, pin }),
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => ({}));
			throw new Error(payload?.error || "Failed to export PII access log");
		}
		return await res.blob();
	},
};
