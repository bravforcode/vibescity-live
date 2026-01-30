import * as Sentry from "@sentry/vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { vTestId } from "./directives/testid.js";

import App from "./App.vue";
import "./assets/css/main.postcss";
import "./assets/vibe-animations.css";
import i18n from "./i18n";
import { vueQueryOptions } from "./plugins/queryClient";

import { headSymbol } from "@unhead/vue";
import { createHead } from "@unhead/vue/client";

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
if (clarityId) {
	Clarity.init(clarityId);
}

// ✅ Initialize Sentry only when configured
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
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

app.use(createPinia());
app.use(i18n);
app.use(VueQueryPlugin, vueQueryOptions);
app.directive("testid", vTestId);
app.mount("#app");

// ✅ Register Service Worker for PWA
if ("serviceWorker" in navigator) {
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
