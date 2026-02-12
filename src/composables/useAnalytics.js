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

export function useAnalytics() {
	const logEvent = async (eventType, eventData = {}) => {
		try {
			const apiBase = getApiV1BaseUrl();
			const headers = await getHeaders();
			// Fire and forget, don't await response to block UI
			fetch(`${apiBase}/analytics/log`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					event_type: eventType,
					data: eventData,
				}),
			});
		} catch (e) {
			console.error("Analytics Error:", e);
		}
	};

	return {
		logEvent,
	};
}
