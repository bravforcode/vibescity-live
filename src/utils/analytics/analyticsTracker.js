/**
 * Analytics Tracker - Unified Analytics System
 *
 * Features:
 * - Event tracking
 * - User behavior tracking
 * - Conversion tracking
 * - Error tracking
 * - Custom dimensions
 * - Privacy-compliant
 */

class AnalyticsTracker {
	constructor(options = {}) {
		this.options = {
			enableGA: true,
			enableClarity: true,
			enableSentry: true,
			enableCustom: true,
			debug: false,
			sampleRate: 1.0,
			...options,
		};

		this.queue = [];
		this.isInitialized = false;
		this.sessionId = this.generateSessionId();
		this.userId = null;
	}

	// Initialize
	async init() {
		if (this.isInitialized) return;

		// Process queued events
		for (const event of this.queue) {
			await this.track(event.name, event.properties);
		}
		this.queue = [];

		this.isInitialized = true;
		this.log("Analytics initialized");
	}

	// Track event
	async track(eventName, properties = {}) {
		if (!this.isInitialized) {
			this.queue.push({ name: eventName, properties });
			return;
		}

		// Sample rate check
		if (Math.random() > this.options.sampleRate) return;

		const event = {
			name: eventName,
			properties: {
				...properties,
				sessionId: this.sessionId,
				userId: this.userId,
				timestamp: Date.now(),
				url: window.location.href,
				referrer: document.referrer,
			},
		};

		this.log("Track event:", event);

		// Send to analytics providers
		await Promise.all([
			this.sendToGA(event),
			this.sendToClarity(event),
			this.sendToCustom(event),
		]);
	}

	// Track page view
	async trackPageView(path, title) {
		await this.track("page_view", {
			page_path: path || window.location.pathname,
			page_title: title || document.title,
		});
	}

	// Track user
	setUser(userId, properties = {}) {
		this.userId = userId;
		this.log("Set user:", userId, properties);

		// Send to analytics providers
		if (this.options.enableGA && window.gtag) {
			window.gtag("set", "user_properties", properties);
		}

		if (this.options.enableClarity && window.clarity) {
			window.clarity("identify", userId, properties);
		}
	}

	// Track conversion
	async trackConversion(conversionName, value, currency = "THB") {
		await this.track("conversion", {
			conversion_name: conversionName,
			value,
			currency,
		});
	}

	// Track error
	async trackError(error, context = {}) {
		const errorData = {
			message: error.message,
			stack: error.stack,
			name: error.name,
			...context,
		};

		await this.track("error", errorData);

		// Send to Sentry
		if (this.options.enableSentry && window.Sentry) {
			window.Sentry.captureException(error, { extra: context });
		}
	}

	// Track timing
	async trackTiming(category, variable, value, label) {
		await this.track("timing", {
			category,
			variable,
			value,
			label,
		});
	}

	// Track custom metric
	async trackMetric(metricName, value, unit = "") {
		await this.track("metric", {
			metric_name: metricName,
			value,
			unit,
		});
	}

	// Send to Google Analytics
	async sendToGA(event) {
		if (!this.options.enableGA || !window.gtag) return;

		try {
			window.gtag("event", event.name, event.properties);
		} catch (error) {
			console.error("[Analytics] GA error:", error);
		}
	}

	// Send to Clarity
	async sendToClarity(event) {
		if (!this.options.enableClarity || !window.clarity) return;

		try {
			window.clarity("event", event.name);
		} catch (error) {
			console.error("[Analytics] Clarity error:", error);
		}
	}

	// Send to custom endpoint
	async sendToCustom(event) {
		if (!this.options.enableCustom) return;

		// ปิดการส่งไป custom endpoint ใน dev mode
		if (import.meta.env.DEV) return;

		try {
			// ตรวจสอบว่ามี endpoint หรือไม่
			const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
			if (!analyticsEndpoint) return;

			// Send to your custom analytics endpoint
			await fetch(analyticsEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(event),
			}).catch(() => {
				// Fail silently - analytics should not break the app
			});
		} catch (error) {
			// Fail silently - analytics should not break the app
			if (this.options.debug) {
				console.error("[Analytics] Custom endpoint error:", error);
			}
		}
	}

	// Generate session ID
	generateSessionId() {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	// Log
	log(...args) {
		if (this.options.debug) {
			console.log("[Analytics]", ...args);
		}
	}
}

// Singleton instance
let trackerInstance = null;

export function useAnalytics(options) {
	if (!trackerInstance) {
		trackerInstance = new AnalyticsTracker(options);
	}
	return trackerInstance;
}

// Vue plugin
export default {
	install(app, options = {}) {
		const tracker = useAnalytics(options);

		// Make available globally
		app.config.globalProperties.$analytics = tracker;

		// Provide/inject
		app.provide("analytics", tracker);

		// Auto-track page views
		if (options.autoTrackPageViews) {
			const router = app.config.globalProperties.$router;
			if (router) {
				router.afterEach((to) => {
					tracker.trackPageView(to.path, to.meta.title);
				});
			}
		}
	},
};

export { AnalyticsTracker };
