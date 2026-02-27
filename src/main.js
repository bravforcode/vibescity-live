import * as Sentry from "@sentry/vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import App from "./App.vue";
import "./design-system/tokens.css";
import "./assets/css/main.postcss";
import "./assets/vibe-animations.css";

import { headSymbol } from "@unhead/vue";
import { createHead } from "@unhead/vue/client";
import { vTestId } from "./directives/testid.js";
import i18n from "./i18n.js";
import { vueQueryOptions } from "./plugins/queryClient";
import router from "./router"; // ✅ Import Router
import { useFeatureFlagStore } from "./store/featureFlagStore";
import { useUserStore } from "./store/userStore";

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
const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

// Default: disabled in dev, enabled in prod (unless explicitly overridden).
const analyticsDisabledByEnv =
	parseEnvBool(import.meta.env.VITE_DISABLE_ANALYTICS) === true;
const analyticsEnabled = analyticsDisabledByEnv
	? false
	: (parseEnvBool(import.meta.env.VITE_ANALYTICS_ENABLED) ??
		!import.meta.env.DEV);
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

// ✅ Initialize Sentry only when configured
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryEnabledInDev = import.meta.env.VITE_SENTRY_ENABLE_DEV === "true";
if (sentryDsn && (!import.meta.env.DEV || sentryEnabledInDev)) {
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
}

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);
// Ensure auth state is available for route guards and admin UI.
try {
	useUserStore(pinia).initAuth?.();
} catch {
	// ignore
}

// Initialize remote feature flags in the background.
const featureFlagStore = useFeatureFlagStore(pinia);
void featureFlagStore.refreshFlags().catch(() => {});

const maybeInitWebVitals = async () => {
	try {
		await featureFlagStore.refreshFlags();
		const forced = parseEnvBool(import.meta.env.VITE_WEB_VITALS_ENABLED);
		const enabled = forced ?? featureFlagStore.isEnabled("enable_web_vitals");
		if (!enabled) return;
		if (!analyticsEnabled) return;
		const { webVitalsService } = await import("./services/webVitalsService");
		webVitalsService.init();
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

// ✅ Register Lottie
import Vue3Lottie from "vue3-lottie";

app.use(Vue3Lottie);

app.mount("#app");

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

// ✅ Register Service Worker for PWA
// In E2E runs, service worker caching can make script/chunk loading flaky.
const isE2E = import.meta.env.VITE_E2E === "true";
const swDevEnabled = parseEnvBool(import.meta.env.VITE_SW_DEV) === true;

// Dev-only warning when a SW is already controlling the page (can cause "CSS missing" / stale chunks).
if (
	import.meta.env.DEV &&
	!swDevEnabled &&
	"serviceWorker" in navigator &&
	navigator.serviceWorker?.controller
) {
	console.warn(
		"[SW] A Service Worker is controlling this page. In dev, this can cause stale JS/CSS.",
		"To fix: DevTools > Application > Service Workers > Unregister, then hard reload.",
	);
}

// In dev, aggressively unregister old service workers unless explicitly enabled.
if (
	import.meta.env.DEV &&
	!swDevEnabled &&
	!isE2E &&
	"serviceWorker" in navigator
) {
	void navigator.serviceWorker
		.getRegistrations()
		.then((registrations) =>
			Promise.allSettled(
				registrations.map((registration) => registration.unregister()),
			),
		)
		.catch(() => {});
}

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
