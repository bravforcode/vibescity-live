/**
 * Frontend Distributed Tracing with OpenTelemetry
 */

import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { getWebAutoInstrumentations } from "@opentelemetry/auto-instrumentations-web";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
	SEMRESATTRS_SERVICE_NAME,
	SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

interface TracingConfig {
	enabled: boolean;
	endpoint: string;
	serviceName: string;
	serviceVersion: string;
	environment: string;
	samplingRate: number;
}

let provider: WebTracerProvider | null = null;
let tracer: ReturnType<typeof trace.getTracer> | null = null;

/**
 * Initialize OpenTelemetry tracing for the frontend
 */
export function initializeTracing(config: TracingConfig): void {
	if (!config.enabled) {
		console.log("[Tracing] Disabled");
		return;
	}

	try {
		// Create resource with service information
		const resource = new Resource({
			[SEMRESATTRS_SERVICE_NAME]: config.serviceName,
			[SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion,
			"deployment.environment": config.environment,
		});

		// Create tracer provider
		provider = new WebTracerProvider({
			resource,
		});

		// Configure OTLP exporter
		const exporter = new OTLPTraceExporter({
			url: config.endpoint,
		});

		// Add batch span processor
		provider.addSpanProcessor(new BatchSpanProcessor(exporter));

		// Register the provider
		provider.register({
			contextManager: new ZoneContextManager(),
		});

		// Auto-instrument browser APIs
		registerInstrumentations({
			instrumentations: [
				getWebAutoInstrumentations({
					"@opentelemetry/instrumentation-fetch": {
						propagateTraceHeaderCorsUrls: [/.*/],
						clearTimingResources: true,
					},
					"@opentelemetry/instrumentation-xml-http-request": {
						propagateTraceHeaderCorsUrls: [/.*/],
					},
				}),
			],
		});

		tracer = trace.getTracer(config.serviceName);
		console.log(
			`[Tracing] Initialized: ${config.serviceName} -> ${config.endpoint}`,
		);
	} catch (error) {
		console.error("[Tracing] Initialization failed:", error);
	}
}

/**
 * Create a custom span for manual instrumentation
 */
export function createSpan(
	name: string,
	attributes?: Record<string, string | number | boolean>,
) {
	if (!tracer) {
		return null;
	}

	const span = tracer.startSpan(name);

	if (attributes) {
		Object.entries(attributes).forEach(([key, value]) => {
			span.setAttribute(key, value);
		});
	}

	return {
		end: () => span.end(),
		setStatus: (code: SpanStatusCode, message?: string) =>
			span.setStatus({ code, message }),
		setAttribute: (key: string, value: string | number | boolean) =>
			span.setAttribute(key, value),
		addEvent: (
			name: string,
			attributes?: Record<string, string | number | boolean>,
		) => {
			span.addEvent(name, attributes);
		},
	};
}

/**
 * Trace a user interaction
 */
export function traceUserInteraction(
	action: string,
	target: string,
	metadata?: Record<string, any>,
) {
	const span = createSpan(`user.${action}`, {
		"user.action": action,
		"user.target": target,
		...metadata,
	});

	return span;
}

/**
 * Trace a page load
 */
export function tracePageLoad(pageName: string, route: string) {
	const span = createSpan("page.load", {
		"page.name": pageName,
		"page.route": route,
	});

	// Add performance metrics
	if (window.performance?.timing) {
		const timing = window.performance.timing;
		const loadTime = timing.loadEventEnd - timing.navigationStart;
		const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

		span?.setAttribute("page.load_time_ms", loadTime);
		span?.setAttribute("page.dom_ready_ms", domReady);
	}

	return span;
}

/**
 * Trace an API call
 */
export function traceApiCall(
	method: string,
	endpoint: string,
	statusCode?: number,
) {
	const span = createSpan("api.call", {
		"http.method": method,
		"http.url": endpoint,
	});

	if (statusCode) {
		span?.setAttribute("http.status_code", statusCode);
		if (statusCode >= 400) {
			span?.setStatus(SpanStatusCode.ERROR, `HTTP ${statusCode}`);
		}
	}

	return span;
}

/**
 * Get the current tracer instance
 */
export function getTracer() {
	return tracer;
}

/**
 * Shutdown tracing (cleanup)
 */
export async function shutdownTracing(): Promise<void> {
	if (provider) {
		await provider.shutdown();
		console.log("[Tracing] Shutdown complete");
	}
}
