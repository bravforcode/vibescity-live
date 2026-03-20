import { apiFetch, parseApiJson } from "@/services/apiClient";
import { getOrCreateVisitorId } from "@/services/visitorIdentity";

const withVisitor = (path) => {
	const visitorId = getOrCreateVisitorId();
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}visitor_id=${encodeURIComponent(visitorId)}`;
};

const fetchDashboardBff = async (path, fallbackMessage) => {
	const response = await apiFetch(withVisitor(path), {
		method: "GET",
		includeVisitor: true,
		refreshVisitorTokenIfNeeded: true,
		useApiEnvelope: true,
	});
	const payload = await parseApiJson(response, fallbackMessage);
	return payload?.data;
};

export const dashboardBffService = {
	getOwnerSummary() {
		return fetchDashboardBff(
			"/dashboard/owner-summary",
			"Unable to load owner summary",
		);
	},
	getPartnerSummary() {
		return fetchDashboardBff(
			"/dashboard/partner-summary",
			"Unable to load partner summary",
		);
	},
};
