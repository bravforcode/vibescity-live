/**
 * Vue Plugin for OpenTelemetry Tracing
 */
import type { App } from "vue";
import {
	initializeTracing,
	tracePageLoad,
	traceUserInteraction,
} from "@/services/tracing";

export interface TracingPluginOptions {
	enabled?: boolean;
	endpoint?: string;
	serviceName?: string;
	serviceVersion?: string;
	environment?: string;
	samplingRate?: number;
	traceRouteChanges?: boolean;
	traceUserClicks?: boolean;
}

export default {
	install(app: App, options: TracingPluginOptions = {}) {
		const config = {
			enabled: options.enabled ?? import.meta.env.VITE_OTEL_ENABLED === "true",
			endpoint:
				options.endpoint ??
				import.meta.env.VITE_OTEL_ENDPOINT ??
				"http://localhost:4318/v1/traces",
			serviceName: options.serviceName ?? "vibecity-frontend",
			serviceVersion:
				options.serviceVersion ?? import.meta.env.VITE_APP_VERSION ?? "1.0.0",
			environment:
				options.environment ?? import.meta.env.VITE_ENV ?? "development",
			samplingRate: options.samplingRate ?? 0.1,
		};

		// Initialize tracing
		initializeTracing(config);

		// Trace route changes
		if (options.traceRouteChanges !== false) {
			app.config.globalProperties.$router?.afterEach((to, _from) => {
				const span = tracePageLoad(to.name?.toString() ?? "unknown", to.path);
				span?.end();
			});
		}

		// Trace user clicks (optional)
		if (options.traceUserClicks) {
			document.addEventListener("click", (event) => {
				const target = event.target as HTMLElement;
				const tagName = target.tagName.toLowerCase();
				const id = target.id;
				const className = target.className;

				const span = traceUserInteraction("click", tagName, {
					"element.id": id,
					"element.class": className,
				});
				span?.end();
			});
		}
	},
};
