import * as Sentry from "@sentry/vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import App from "./App.vue";
// ✅ MapLibre GL CSS must be imported eagerly here (not inside the lazy HomeView chunk)
// Importing inside MapboxContainer.vue or useMapCore.js causes ERR_INSUFFICIENT_RESOURCES
// because the browser tries to load it as part of a dynamically-split CSS chunk.
import "maplibre-gl/dist/maplibre-gl.css";
import "./assets/css/main.postcss";
import "./assets/vibe-animations.css";
import "./design-system/tokens.css";

import { headSymbol } from "@unhead/vue";
import { createHead } from "@unhead/vue/client";
import { vTestId } from "./directives/testid.js";
import i18n from "./i18n.js";
import { vueQueryOptions } from "./plugins/queryClient";
import router from "./router"; // ✅ Import Router
import { useFeatureFlagStore } from "./store/featureFlagStore";
import { cleanupStores } from "./store/index";

const app = createApp(App);
const head = createHead();

// ✅ Patch: Shim install if missing (fixes unhead v2 issue)
if (!head.install) {
	head.install = (app) => {
		app.provide(headSymbol, head);
	};
}

app.use(head);

// ✅ Microsoft Clarity
import Clarity from "@microsoft/clarity";

const clarityId = import.meta.env.VITE_CLARITY_PROJECT_ID;
const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;
const DEV_SW_RELOAD_GUARD = "__vibecity_dev_sw_reloaded__";
const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};
const isLocalPreviewHost =
	typeof window !== "undefined" &&
	import.meta.env.PROD &&
	LOCALHOST_PATTERN.test(window.location.hostname);
const isE2E =
	import.meta.env.VITE_E2E === "true" ||
	import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
	import.meta.env.MODE === "e2e";
const swDevEnabled = parseEnvBool(import.meta.env.VITE_SW_DEV) === true;

// Default: disabled in dev, enabled in prod (unless explicitly overridden).
const analyticsDisabledByEnv =
	parseEnvBool(import.meta.env.VITE_DISABLE_ANALYTICS) === true;
const analyticsEnabled = analyticsDisabledByEnv
	? false
	: (parseEnvBool(import.meta.env.VITE_ANALYTICS_ENABLED) ??
		(!import.meta.env.DEV && !isLocalPreviewHost));
const hasAnalyticsConsent = () => {
	try {
		// Respect Do Not Track as a hard deny.
		if (typeof navigator !== "undefined" && navigator.doNotTrack === "1")
			return false;
		return localStorage.getItem("vibe_analytics_consent") === "granted";
	} catch {
		return false;
	}
};

const maybeInitClarity = () => {
	if (!analyticsEnabled) return;
	if (!clarityId) return;
	if (globalThis.__vibecity_clarity_inited) return;
	globalThis.__vibecity_clarity_inited = true;
	Clarity.init(clarityId);
};

// Defer Clarity initialization to after main-thread critical work.
const deferTask = (fn) => {
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(fn, { timeout: 3000 });
	} else {
		window.addEventListener("load", () => setTimeout(fn, 0), { once: true });
	}
};

const clearDevServiceWorkersBeforeMount = async () => {
	if (
		typeof window === "undefined" ||
		!import.meta.env.DEV ||
		swDevEnabled ||
		isE2E ||
		!("serviceWorker" in navigator)
	) {
		return true;
	}

	try {
		const registrations = await navigator.serviceWorker.getRegistrations();
		const hadController = Boolean(navigator.serviceWorker.controller);

		if (!registrations.length && !hadController) {
			sessionStorage.removeItem(DEV_SW_RELOAD_GUARD);
			return true;
		}

		await Promise.allSettled(
			registrations.map((registration) => registration.unregister()),
		);

		if (
			"caches" in window &&
			LOCALHOST_PATTERN.test(window.location.hostname)
		) {
			const cacheKeys = await caches.keys();
			await Promise.allSettled(cacheKeys.map((key) => caches.delete(key)));
		}

		if (hadController) {
			const alreadyReloaded =
				sessionStorage.getItem(DEV_SW_RELOAD_GUARD) === "1";
			if (!alreadyReloaded) {
				sessionStorage.setItem(DEV_SW_RELOAD_GUARD, "1");
				window.location.reload();
				return false;
			}
		}

		sessionStorage.removeItem(DEV_SW_RELOAD_GUARD);
	} catch {
		// Fail open in dev: if cleanup fails, do not block the app.
	}

	return true;
};

deferTask(() => {
	maybeInitClarity();
});
if (typeof window !== "undefined") {
	window.addEventListener("vibecity:consent", (evt) => {
		if (evt?.detail?.analytics === "granted") {
			maybeInitClarity();
		}
	});
}

// ✅ Initialize Sentry only when configured — deferred to reduce TTI blocking
const initSentryDeferred = () => {
	const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
	const sentryEnabledInDev = import.meta.env.VITE_SENTRY_ENABLE_DEV === "true";
	if (!sentryDsn || (import.meta.env.DEV && !sentryEnabledInDev)) return;
	if (analyticsDisabledByEnv) return;

	const tracesSampleRate = Number(
		import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
	);
	const replaysSessionSampleRate = Number(
		import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0,
	);
	const replaysOnErrorSampleRate = Number(
		import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 0,
	);

	Sentry.init({
		app,
		dsn: sentryDsn,

		// Privacy-first defaults
		sendDefaultPii: false,
		beforeSend(event) {
			// Scrub URL query params to avoid leaking user context
			if (event.request?.url) {
				try {
					const url = new URL(event.request.url);
					url.search = "";
					event.request.url = url.toString();
				} catch {
					// ignore
				}
			}
			return event;
		},

		integrations: [
			Sentry.browserTracingIntegration(),
			// Replay can be heavy; keep it opt-in via env sample rates
			Sentry.replayIntegration({
				maskAllText: true,
				blockAllMedia: true,
			}),
		],

		// Performance Monitoring
		tracesSampleRate: Number.isFinite(tracesSampleRate)
			? tracesSampleRate
			: 0.1,

		// Session Replay
		replaysSessionSampleRate: Number.isFinite(replaysSessionSampleRate)
			? replaysSessionSampleRate
			: 0,
		replaysOnErrorSampleRate: Number.isFinite(replaysOnErrorSampleRate)
			? replaysOnErrorSampleRate
			: 0,
	});
};

// Defer Sentry init to idle time
deferTask(initSentryDeferred);

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);

// Initialize remote feature flags in the background.
const featureFlagStore = useFeatureFlagStore(pinia);
if (!isE2E) {
	void featureFlagStore.refreshFlags().catch(() => {});
}

const maybeInitWebVitals = async () => {
	try {
		if (isE2E) return;
		await featureFlagStore.refreshFlags();
		const forced = parseEnvBool(import.meta.env.VITE_WEB_VITALS_ENABLED);
		const enabled = forced ?? featureFlagStore.isEnabled("enable_web_vitals");
		if (!enabled) return;
		if (!analyticsEnabled) return;
		const { webVitalsService } = await import("./services/webVitalsService");
		webVitalsService.init();
		webVitalsService.setContext({
			route: window.location.pathname || "/",
		});
	} catch {
		// fail-open
	}
};
app.use(i18n);
app.use(router); // ✅ Register Router

// ✅ Privacy-safe page view analytics (path only, no query params).
router.afterEach((to) => {
	try {
		// PII audit (raw IP) is handled by a separate Edge function and is not consent-gated.
		// Fail-open and throttle client pings to avoid noise.
		void import("./services/piiAuditService")
			.then(({ piiAuditService }) => piiAuditService.ping("route_change"))
			.catch(() => {});

		if (!analyticsEnabled) return;
		const path =
			typeof to?.path === "string" ? to.path : window.location.pathname;
		const normalized = path?.startsWith("/") ? path : `/${path}`;
		void import("./services/webVitalsService")
			.then(({ webVitalsService }) =>
				webVitalsService.setContext({ route: normalized }),
			)
			.catch(() => {});
		// Lazy import to keep initial bundle lean and avoid CORS noise in dev.
		void import("./services/analyticsService")
			.then(({ analyticsService }) =>
				analyticsService.trackEvent(
					"page_view",
					{ path: normalized },
					normalized,
				),
			)
			.catch(() => {});
	} catch {
		// ignore
	}
});
app.use(VueQueryPlugin, vueQueryOptions);
app.directive("testid", vTestId);

// ✅ Haptic Feedback Directive
import vHaptic from "./directives/vHaptic.js";

app.directive("haptic", vHaptic);

// ✅ Phase 1: Foundation Systems Integration
import MasterIntegration from "./plugins/masterIntegration";

app.use(MasterIntegration, {
	phase1: {
		enablePerformanceMonitoring: !import.meta.env.DEV && !isLocalPreviewHost,
		enableAnalytics: analyticsEnabled,
		enableErrorHandling: true,
		enableHealthChecks: !import.meta.env.DEV && !isLocalPreviewHost,
		enableServiceWorker: !import.meta.env.DEV,
		enableSecurity: true,
		enableCodeOptimization: true,
	},
});

// ✅ Cleanup Supabase Realtime channels and store subscriptions on page unload
if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", () => {
		cleanupStores().catch(() => {});
	});
}

// ✅ Global unhandled promise rejection logger (dev + prod safe)
if (typeof window !== "undefined") {
	window.addEventListener("unhandledrejection", (event) => {
		const reason = event?.reason;
		console.error(
			"[VibeCity] Unhandled promise rejection:",
			reason instanceof Error ? reason : String(reason ?? "unknown"),
		);
		// Don't prevent default — let Sentry / browser devtools also see it
	});
}

// Start web-vitals collection after initial paint to avoid startup contention.
try {
	requestAnimationFrame(() => {
		void maybeInitWebVitals();
	});
} catch {
	void maybeInitWebVitals();
}

// Initial PII audit ping after first paint.
try {
	requestAnimationFrame(() => {
		void import("./services/piiAuditService")
			.then(({ piiAuditService }) => piiAuditService.ping("app_start"))
			.catch(() => {});
	});
} catch {
	void import("./services/piiAuditService")
		.then(({ piiAuditService }) => piiAuditService.ping("app_start"))
		.catch(() => {});
}

const mountApp = async () => {
	const shouldMount = await clearDevServiceWorkersBeforeMount();
	if (!shouldMount) return;

	app.mount("#app");

	// Default: register SW only in prod/preview. Allow opt-in in dev via VITE_SW_DEV=true.
	if (
		!isE2E &&
		"serviceWorker" in navigator &&
		(!import.meta.env.DEV || swDevEnabled)
	) {
		window.addEventListener("load", () => {
			navigator.serviceWorker
				.register("/sw.js")
				.then((registration) => {
					if (import.meta.env.DEV) {
						console.log("✅ SW registered:", registration.scope);
					}
				})
				.catch((error) => {
					if (import.meta.env.DEV) {
						console.error("❌ SW registration failed:", error);
					}
				});
		});
	}
};

void mountApp();
