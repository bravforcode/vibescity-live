import i18n from "@/i18n";
import { getApiV1BaseUrl } from "@/lib/runtimeConfig";
import { parseOrderEvent } from "@/realtime/contracts/v1/orderEvents";
import { getVisitorToken } from "@/services/visitorIdentity";

const buildUrl = (visitorId) => {
	const base = getApiV1BaseUrl().replace(/\/$/, "");
	const visitorToken = String(getVisitorToken?.() || "").trim();
	const query = new URLSearchParams({
		visitor_id: String(visitorId || ""),
	});
	if (visitorToken) query.set("visitor_token", visitorToken);
	return `${base}/partner/payout/events?${query.toString()}`;
};

export const subscribePayoutEvents = ({ visitorId, onEvent, onError }) => {
	if (!visitorId)
		throw new Error(
			i18n.global.t("partner.error_payout_events_visitor_required"),
		);
	const url = buildUrl(visitorId);
	const source = new EventSource(url, { withCredentials: true });

	source.addEventListener("message", (event) => {
		try {
			const payload = JSON.parse(event.data || "{}");
			const parsed = parseOrderEvent(payload);
			if (!parsed) {
				onError?.(
					new Error(i18n.global.t("partner.error_payout_events_unsupported")),
				);
				return;
			}
			onEvent?.(parsed);
		} catch (error) {
			onError?.(error);
		}
	});
	source.addEventListener("error", (error) => {
		onError?.(error);
	});

	return () => {
		source.close();
	};
};
