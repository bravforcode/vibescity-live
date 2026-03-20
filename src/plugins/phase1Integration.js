/**
 * Phase 1 Integration Plugin
 *
 * Integrates all Phase 1 features:
 * - Performance monitoring
 * - Security
 * - Analytics
 * - Error handling
 * - Health checks
 * - Service worker
 */

import { useAnalytics } from "@/utils/analytics/analyticsTracker";
import {
	setupGlobalErrorHandler,
	VueErrorBoundary,
} from "@/utils/errorHandling/errorBoundary";
import { useHealthCheck } from "@/utils/monitoring/healthCheck";
import { vPrefetch } from "@/utils/performance/codeSplitting";
import { vLazyImage } from "@/utils/performance/imageOptimization";
import { usePerformanceMonitor } from "@/utils/performance/performanceMonitor";
import { useServiceWorkerManager } from "@/utils/pwa/serviceWorkerManager";
import { isAppDebugLoggingEnabled } from "../utils/debugFlags";

const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;
const isLocalPreviewHost =
	typeof window !== "undefined" &&
	import.meta.env.PROD &&
	LOCALHOST_PATTERN.test(window.location.hostname);

// Helper to parse environment boolean
const parseEnvBool = (value, defaultValue = true) => {
	if (value === undefined || value === null) return defaultValue;
	const raw = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return defaultValue;
};

export default {
	install(app, options = {}) {
		const debugLog = (...args) => {
			if (isAppDebugLoggingEnabled()) {
				console.log(...args);
			}
		};

		// Read from environment variables with fallback to options
		const {
			enablePerformanceMonitoring = parseEnvBool(
				import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING,
				!import.meta.env.DEV, // ปิดใน dev mode
			),
			enableAnalytics = parseEnvBool(
				import.meta.env.VITE_ENABLE_ANALYTICS,
				!import.meta.env.DEV && !isLocalPreviewHost, // ปิดใน dev mode + localhost preview
			),
			enableErrorHandling = parseEnvBool(
				import.meta.env.VITE_ENABLE_ERROR_HANDLING,
				true,
			),
			enableHealthChecks = parseEnvBool(
				import.meta.env.VITE_ENABLE_HEALTH_CHECKS,
				!import.meta.env.DEV && !isLocalPreviewHost, // ปิดใน dev mode + localhost preview
			),
			enableServiceWorker = parseEnvBool(
				import.meta.env.VITE_ENABLE_SERVICE_WORKER,
				!import.meta.env.DEV, // ปิดใน dev mode
			),
			enableSecurity = parseEnvBool(import.meta.env.VITE_ENABLE_SECURITY, true),
			enableCodeOptimization = parseEnvBool(
				import.meta.env.VITE_ENABLE_CODE_OPTIMIZATION,
				true,
			),
			performanceOptions = {},
			analyticsOptions = {},
			errorOptions = {},
			healthOptions = {},
			swOptions = {},
		} = options;

		debugLog("[Phase1] Initializing...");

		// แสดงเฉพาะใน dev mode
		if (isAppDebugLoggingEnabled()) {
			debugLog("[Phase1] Configuration:", {
				enablePerformanceMonitoring,
				enableAnalytics,
				enableErrorHandling,
				enableHealthChecks,
				enableServiceWorker,
				enableSecurity,
				enableCodeOptimization,
			});
		}

		// 1. Performance Monitoring
		if (enablePerformanceMonitoring) {
			const perfMonitor = usePerformanceMonitor({
				...performanceOptions,
				enableFPS: false, // ปิดเพื่อลดภาระ
				enableMemory: false, // ปิดเพื่อลดภาระ
				enableNetwork: false, // ปิดเพื่อลดภาระ
				enableWebVitals: !import.meta.env.DEV, // เปิดเฉพาะ production
				onMetric: (category, metric) => {
					// ส่งไป analytics เฉพาะ production
					if (!import.meta.env.DEV && enableAnalytics) {
						const analytics = useAnalytics();
						analytics.trackMetric(`perf_${category}`, metric.value);
					}
				},
				onBudgetExceeded: (metric, actual, budget) => {
					// แจ้งเตือนเฉพาะ production
					if (!import.meta.env.DEV) {
						console.warn(`[Performance] Budget exceeded: ${metric}`);

						// Track in analytics
						if (enableAnalytics) {
							const analytics = useAnalytics();
							analytics.track("performance_budget_exceeded", {
								metric,
								actual,
								budget,
							});
						}
					}
				},
			});

			perfMonitor.start();

			// Make available globally
			app.config.globalProperties.$perfMonitor = perfMonitor;
			app.provide("perfMonitor", perfMonitor);

			debugLog("[Phase1] Performance monitoring enabled (limited in dev)");
		}

		// 2. Analytics
		if (enableAnalytics) {
			const analytics = useAnalytics({
				...analyticsOptions,
				autoTrackPageViews: true,
			});

			analytics.init();

			// Make available globally
			app.config.globalProperties.$analytics = analytics;
			app.provide("analytics", analytics);

			// Track app mounted
			analytics.track("app_mounted", {
				version: import.meta.env.VITE_APP_VERSION || "2.0.0",
			});

			debugLog("[Phase1] Analytics enabled");
		}

		// 3. Error Handling
		if (enableErrorHandling) {
			const errorBoundary = setupGlobalErrorHandler(app, {
				...errorOptions,
				onError: (errorData) => {
					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.trackError(errorData.error, {
							info: errorData.info,
						});
					}
				},
			});

			// Register error boundary component
			app.component("ErrorBoundary", VueErrorBoundary);

			// Make available globally
			app.config.globalProperties.$errorBoundary = errorBoundary;
			app.provide("errorBoundary", errorBoundary);

			debugLog("[Phase1] Error handling enabled");
		}

		// 4. Health Checks
		if (enableHealthChecks) {
			const healthCheck = useHealthCheck({
				...healthOptions,
				onHealthChange: (prev, current, health) => {
					debugLog(`[Health] Status changed: ${prev} -> ${current}`);

					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.track("health_status_changed", {
							previous: prev,
							current,
							checks: health.checks,
						});
					}
				},
				onUnhealthy: (health) => {
					console.error("[Health] System unhealthy:", health);

					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.track("system_unhealthy", {
							checks: health.checks,
						});
					}
				},
			});

			healthCheck.start();

			// Make available globally
			app.config.globalProperties.$healthCheck = healthCheck;
			app.provide("healthCheck", healthCheck);

			debugLog("[Phase1] Health checks enabled");
		}

		// 5. Service Worker
		if (!enableServiceWorker && "serviceWorker" in navigator) {
			// Unregister any stale SW so it can't serve cached old bundles
			navigator.serviceWorker.getRegistrations().then((registrations) => {
				for (const reg of registrations) reg.unregister();
			});
		}

		if (enableServiceWorker && "serviceWorker" in navigator) {
			const swManager = useServiceWorkerManager({
				...swOptions,
				onUpdate: (_newWorker) => {
					debugLog("[SW] Update available — reloading");

					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.track("sw_update_available");
					}

					// Auto-reload: SW already skipped waiting via sw.js install event
					swManager.skipWaiting();
				},
				onOffline: () => {
					debugLog("[SW] App is offline");

					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.track("app_offline");
					}
				},
				onOnline: () => {
					debugLog("[SW] App is online");

					// Track in analytics
					if (enableAnalytics) {
						const analytics = useAnalytics();
						analytics.track("app_online");
					}
				},
			});

			swManager.register();

			// Make available globally
			app.config.globalProperties.$swManager = swManager;
			app.provide("swManager", swManager);

			debugLog("[Phase1] Service worker enabled");
		}

		// 6. Register directives
		app.directive("lazy-image", vLazyImage);
		app.directive("prefetch", vPrefetch);

		debugLog("[Phase1] Directives registered");

		// 7. Cleanup on unmount
		app.config.globalProperties.$phase1Cleanup = () => {
			if (enablePerformanceMonitoring) {
				const perfMonitor = usePerformanceMonitor();
				perfMonitor.stop();
			}

			if (enableHealthChecks) {
				const healthCheck = useHealthCheck();
				healthCheck.stop();
			}

			debugLog("[Phase1] Cleanup complete");
		};

		debugLog("[Phase1] Initialization complete ✅");
	},
};
