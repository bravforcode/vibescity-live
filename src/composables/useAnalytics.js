import { analyticsService } from "../services/analyticsService";

export function useAnalytics() {
	const logEvent = (eventType, eventData = {}) =>
		analyticsService.trackEvent(eventType, eventData);

	return {
		logEvent,
	};
}
