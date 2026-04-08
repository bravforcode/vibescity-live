import { v4 as uuidv4 } from "uuid";
import {
	hasAnalyticsConsent,
	isBrowserAnalyticsEnabled,
} from "../lib/analyticsRuntime";
import { supabase } from "../lib/supabase";

const ANALYTICS_ENDPOINT = "analytics-ingest";
const STORAGE_KEY_VISITOR = "vibe_visitor_id";
const INVOKE_TIMEOUT_MS = 2500;

// Circuit breaker state
let failureCount = 0;
const MAX_FAILURES = 3;
let circuitOpen = false;

const analyticsEnabled = isBrowserAnalyticsEnabled();

const recordFailure = (reason) => {
	failureCount++;
	if (failureCount >= MAX_FAILURES) {
		circuitOpen = true;
		if (import.meta.env.DEV) {
			console.warn(
				"⚠️ Analytics circuit breaker opened after",
				MAX_FAILURES,
				"failures",
				reason ? `(${String(reason)})` : "",
			);
		}
	}
};

const recordSuccess = () => {
	failureCount = 0;
};

export const analyticsService = {
	// Get or Create anonymous visitor ID
	getVisitorId() {
		try {
			let id = localStorage.getItem(STORAGE_KEY_VISITOR);
			if (!id) {
				id = uuidv4();
				localStorage.setItem(STORAGE_KEY_VISITOR, id);
			}
			return id;
		} catch {
			// If storage is blocked, still return a stable-ish id for the session.
			return uuidv4();
		}
	},

	hasConsent() {
		return hasAnalyticsConsent();
	},

	async trackSession() {
		if (!analyticsEnabled) return;
		if (!this.hasConsent() || circuitOpen) return;

		try {
			const { error } = await supabase.functions.invoke(ANALYTICS_ENDPOINT, {
				body: {
					event_type: "session_start",
					visitor_id: this.getVisitorId(),
					metadata: {
						referrer: document.referrer,
						screen_width: window.innerWidth,
						language: navigator.language,
					},
				},
				timeout: INVOKE_TIMEOUT_MS,
			});
			if (error) {
				recordFailure(error?.message || error);
				return;
			}
			recordSuccess();
		} catch (err) {
			recordFailure(err?.message || err);
		}
	},

	async trackEvent(eventType, metadata = {}, shopId = null) {
		if (!analyticsEnabled) return;
		if (!this.hasConsent() || circuitOpen) return;

		try {
			const normalizedVenueRef =
				shopId === null || shopId === undefined ? null : String(shopId);
			const { error } = await supabase.functions.invoke(ANALYTICS_ENDPOINT, {
				body: {
					event_type: eventType,
					visitor_id: this.getVisitorId(),
					// Use venue_ref as canonical to avoid schema drift on shop_id types.
					venue_ref: normalizedVenueRef,
					shop_id: normalizedVenueRef,
					metadata,
				},
				timeout: INVOKE_TIMEOUT_MS,
			});

			if (error) {
				recordFailure(error?.message || error);
				return;
			}

			recordSuccess();
		} catch (err) {
			recordFailure(err?.message || err);
		}
	},

	async trackWebVital(payload = {}) {
		if (!analyticsEnabled) return;
		if (!this.hasConsent() || circuitOpen) return;

		try {
			const metadata = {
				metric_name: String(payload.metric_name || "").toUpperCase(),
				value: Number(payload.value || 0),
				path_template: String(payload.path_template || "/"),
				device_form_factor: String(payload.device_form_factor || "unknown"),
				connection_type: String(payload.connection_type || "unknown"),
			};
			const { error } = await supabase.functions.invoke(ANALYTICS_ENDPOINT, {
				body: {
					event_type: "web_vital",
					metadata,
				},
				timeout: INVOKE_TIMEOUT_MS,
			});
			if (error) {
				recordFailure(error?.message || error);
				return;
			}
			recordSuccess();
		} catch (err) {
			recordFailure(err?.message || err);
		}
	},

	// Get circuit breaker status for debugging
	getStatus() {
		return { enabled: analyticsEnabled, circuitOpen, failureCount };
	},
};
