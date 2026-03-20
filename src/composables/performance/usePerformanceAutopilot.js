import { computed, onMounted, onUnmounted, watch } from "vue";
import { frontendObservabilityService } from "../../services/frontendObservabilityService";
import { useServiceWorker } from "../useServiceWorker";
import { usePerformanceMonitor } from "./usePerformanceMonitor";
import { usePerformanceOptimizer } from "./usePerformanceOptimizer";

const isE2EEnv = () =>
	import.meta.env.VITE_E2E === "true" ||
	import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
	import.meta.env.MODE === "e2e";

const clampPositive = (value, fallback) => {
	const num = Number(value);
	return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
};

const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

export function usePerformanceAutopilot(options = {}) {
	const isEnabledSource =
		typeof options.enabled === "function"
			? options.enabled
			: () => options.enabled !== false;
	const reportIntervalMs = clampPositive(options.reportIntervalMs, 15000);
	const serviceWorkerScriptURL = String(
		options.serviceWorkerScriptURL || "/sw.js",
	);
	const enableServiceWorker = options.enableServiceWorker !== false;
	const serviceWorkerEnabledInDev =
		parseEnvBool(import.meta.env.VITE_SW_DEV) === true;
	const canRegisterServiceWorker =
		!import.meta.env.DEV || serviceWorkerEnabledInDev;

	const performanceMonitor = usePerformanceMonitor();
	const performanceOptimizer = usePerformanceOptimizer();
	const tileServiceWorker = useServiceWorker({
		scriptURL: serviceWorkerScriptURL,
		autoRegister: false,
		autoReloadOnControllerChange: false,
	});

	const shouldRun = computed(() => Boolean(isEnabledSource()) && !isE2EEnv());
	const runtimeSummary = computed(() => ({
		fps: Number(performanceMonitor.fps.value || 0),
		performanceLevel: performanceMonitor.performanceLevel.value,
		performanceScore: Number(performanceMonitor.performanceScore.value || 0),
		optimizerLevel: performanceOptimizer.performanceLevel.value,
		reduceEffects: Boolean(performanceOptimizer.shouldReduceEffects.value),
		reducedMotion: Boolean(performanceOptimizer.prefersReducedMotion.value),
		swRegistered: Boolean(tileServiceWorker.isRegistered.value),
		swControlling: Boolean(tileServiceWorker.isControlling.value),
	}));

	let reportTimer = null;
	const emitSummary = () => {
		if (!shouldRun.value) return;
		const summary = runtimeSummary.value;
		void frontendObservabilityService.reportFrontendGuardrail(
			"performance_autopilot",
			{
				fps: summary.fps,
				score: summary.performanceScore,
				level: summary.performanceLevel,
				optimizer: summary.optimizerLevel,
				reduceEffects: summary.reduceEffects,
				swRegistered: summary.swRegistered,
				swControlling: summary.swControlling,
			},
		);
	};

	const startReporting = () => {
		if (reportTimer || !shouldRun.value) return;
		reportTimer = setInterval(emitSummary, reportIntervalMs);
	};

	const stopReporting = () => {
		if (!reportTimer) return;
		clearInterval(reportTimer);
		reportTimer = null;
	};

	const registerServiceWorkerIfEnabled = async () => {
		if (!enableServiceWorker || !shouldRun.value || !canRegisterServiceWorker)
			return;
		await tileServiceWorker.registerServiceWorker();
	};

	onMounted(() => {
		if (!shouldRun.value) return;
		startReporting();
		void registerServiceWorkerIfEnabled();
		emitSummary();
		if (typeof window !== "undefined") {
			window.__vibecityPerformanceAutopilot = runtimeSummary;
		}
	});

	onUnmounted(() => {
		stopReporting();
		if (typeof window !== "undefined") {
			window.__vibecityPerformanceAutopilot = null;
		}
	});

	watch(
		() => shouldRun.value,
		(enabled) => {
			if (!enabled) {
				stopReporting();
				return;
			}
			startReporting();
			void registerServiceWorkerIfEnabled();
			emitSummary();
		},
	);

	return {
		shouldRun,
		runtimeSummary,
		performanceMonitor,
		performanceOptimizer,
		tileServiceWorker,
		emitSummary,
	};
}
