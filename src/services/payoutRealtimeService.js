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
		throw new Error("visitorId is required for payout event subscription");
	const url = buildUrl(visitorId);
	const source = new EventSource(url, { withCredentials: true });

	source.addEventListener("message", (event) => {
		try {
			const payload = JSON.parse(event.data || "{}");
			const parsed = parseOrderEvent(payload);
			if (!parsed) {
				onError?.(
					new Error(
						"Unsupported payout event version or malformed event payload",
					),
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
