import {
	useBattery,
	useDevicePixelRatio,
	useFps,
	useMemory,
	useNetwork,
	usePreferredReducedMotion,
} from "@vueuse/core";
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from "vue";

const TIER_RANK = Object.freeze({
	ultra: 0,
	balanced: 1,
	saver: 2,
	critical: 3,
});

const CONTROL_STRATEGY = Object.freeze([
	"always",
	"balanced",
	"saver",
	"critical",
]);

const CONTROL_DOMAIN_BLUEPRINTS = Object.freeze([
	{ domain: "camera", count: 12 },
	{ domain: "render", count: 20 },
	{ domain: "network", count: 20 },
	{ domain: "memory", count: 16 },
	{ domain: "animation", count: 16 },
	{ domain: "data", count: 14 },
	{ domain: "interaction", count: 14 },
]);

const TIER_SETTINGS = Object.freeze({
	ultra: {
		targetFps: 60,
		mapRefreshDebounceMs: 220,
		mapRefreshMinIntervalMs: 1400,
		mapRefreshDataMinIntervalMs: 750,
		mapRefreshForceMinIntervalMs: 1000,
		trafficRefreshIntervalMs: 18000,
		hotRoadBaseIntervalMs: 18000,
		hotRoadLowPowerIntervalMs: 36000,
		hotRoadMaxIntervalMs: 90000,
		hotRoadRequestTimeoutMs: 7000,
		hotRoadMinZoom: 7,
		hotRoadsEnabled: true,
		routeDirectionsEnabled: true,
		maxVisibleFeatures: 950,
		neonLod: { full: true, compact: true, mini: true },
		frameBudgetMs: 16.7,
		preferredUpdateIntervalMs: 16,
		mapResizeDebounceMs: 90,
		inputThrottleMs: 48,
		maxConcurrentAsyncTasks: 10,
		maxOverlayEffects: 8,
		disableWeatherFx: false,
		disableMapFog: false,
		disableGlowLayers: false,
		disableDashAnimation: false,
		disableCoinAnimation: false,
		disableNonEssentialPrefetch: false,
		pauseWhenHidden: true,
		force2D: true,
		reducePopupMotion: false,
		spriteReducedEffects: false,
		longTaskTolerance: 8,
		reportIntervalMs: 6000,
	},
	balanced: {
		targetFps: 58,
		mapRefreshDebounceMs: 330,
		mapRefreshMinIntervalMs: 2400,
		mapRefreshDataMinIntervalMs: 1000,
		mapRefreshForceMinIntervalMs: 1500,
		trafficRefreshIntervalMs: 26000,
		hotRoadBaseIntervalMs: 26000,
		hotRoadLowPowerIntervalMs: 48000,
		hotRoadMaxIntervalMs: 110000,
		hotRoadRequestTimeoutMs: 7000,
		hotRoadMinZoom: 8,
		hotRoadsEnabled: true,
		routeDirectionsEnabled: true,
		maxVisibleFeatures: 700,
		neonLod: { full: true, compact: true, mini: true },
		frameBudgetMs: 18,
		preferredUpdateIntervalMs: 18,
		mapResizeDebounceMs: 120,
		inputThrottleMs: 56,
		maxConcurrentAsyncTasks: 8,
		maxOverlayEffects: 6,
		disableWeatherFx: false,
		disableMapFog: false,
		disableGlowLayers: false,
		disableDashAnimation: false,
		disableCoinAnimation: false,
		disableNonEssentialPrefetch: false,
		pauseWhenHidden: true,
		force2D: true,
		reducePopupMotion: false,
		spriteReducedEffects: false,
		longTaskTolerance: 6,
		reportIntervalMs: 7000,
	},
	saver: {
		targetFps: 56,
		mapRefreshDebounceMs: 460,
		mapRefreshMinIntervalMs: 3200,
		mapRefreshDataMinIntervalMs: 1400,
		mapRefreshForceMinIntervalMs: 2200,
		trafficRefreshIntervalMs: 38000,
		hotRoadBaseIntervalMs: 42000,
		hotRoadLowPowerIntervalMs: 70000,
		hotRoadMaxIntervalMs: 130000,
		hotRoadRequestTimeoutMs: 6000,
		hotRoadMinZoom: 9,
		hotRoadsEnabled: true,
		routeDirectionsEnabled: false,
		maxVisibleFeatures: 460,
		neonLod: { full: false, compact: true, mini: true },
		frameBudgetMs: 22,
		preferredUpdateIntervalMs: 22,
		mapResizeDebounceMs: 160,
		inputThrottleMs: 72,
		maxConcurrentAsyncTasks: 6,
		maxOverlayEffects: 4,
		disableWeatherFx: true,
		disableMapFog: true,
		disableGlowLayers: true,
		disableDashAnimation: true,
		disableCoinAnimation: true,
		disableNonEssentialPrefetch: true,
		pauseWhenHidden: true,
		force2D: true,
		reducePopupMotion: true,
		spriteReducedEffects: true,
		longTaskTolerance: 4,
		reportIntervalMs: 9000,
	},
	critical: {
		targetFps: 52,
		mapRefreshDebounceMs: 620,
		mapRefreshMinIntervalMs: 4400,
		mapRefreshDataMinIntervalMs: 1900,
		mapRefreshForceMinIntervalMs: 3000,
		trafficRefreshIntervalMs: 55000,
		hotRoadBaseIntervalMs: 80000,
		hotRoadLowPowerIntervalMs: 120000,
		hotRoadMaxIntervalMs: 180000,
		hotRoadRequestTimeoutMs: 5000,
		hotRoadMinZoom: 10,
		hotRoadsEnabled: false,
		routeDirectionsEnabled: false,
		maxVisibleFeatures: 280,
		neonLod: { full: false, compact: false, mini: true },
		frameBudgetMs: 26,
		preferredUpdateIntervalMs: 26,
		mapResizeDebounceMs: 190,
		inputThrottleMs: 90,
		maxConcurrentAsyncTasks: 4,
		maxOverlayEffects: 2,
		disableWeatherFx: true,
		disableMapFog: true,
		disableGlowLayers: true,
		disableDashAnimation: true,
		disableCoinAnimation: true,
		disableNonEssentialPrefetch: true,
		pauseWhenHidden: true,
		force2D: true,
		reducePopupMotion: true,
		spriteReducedEffects: true,
		longTaskTolerance: 3,
		reportIntervalMs: 12000,
	},
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const resolveMaybeRefBoolean = (input) => {
	if (typeof input === "function") return Boolean(input());
	if (input && typeof input === "object" && "value" in input) {
		return Boolean(input.value);
	}
	return Boolean(input);
};

const resolveMaybeRefNumber = (input, fallback = 0) => {
	if (typeof input === "function") return Number(input()) || fallback;
	if (input && typeof input === "object" && "value" in input) {
		return Number(input.value) || fallback;
	}
	return Number(input) || fallback;
};

const resolveMaybeRefString = (input) => {
	if (typeof input === "function")
		return String(input() ?? "")
			.trim()
			.toLowerCase();
	if (input && typeof input === "object" && "value" in input) {
		return String(input.value ?? "")
			.trim()
			.toLowerCase();
	}
	return String(input ?? "")
		.trim()
		.toLowerCase();
};

const strategyRank = (strategy) => {
	switch (strategy) {
		case "critical":
			return TIER_RANK.critical;
		case "saver":
			return TIER_RANK.saver;
		case "balanced":
			return TIER_RANK.balanced;
		default:
			return TIER_RANK.ultra;
	}
};

const isControlEnabledByTier = (tier, strategy) =>
	(TIER_RANK[tier] ?? TIER_RANK.balanced) >= strategyRank(strategy);

const ensureAtLeastOneNeonLod = (lod = {}) => {
	const full = Boolean(lod.full);
	const compact = Boolean(lod.compact);
	const mini = Boolean(lod.mini);
	if (full || compact || mini) {
		return { full, compact, mini };
	}
	return { full: false, compact: false, mini: true };
};

const buildControlCatalog = (tier) => {
	const controls = [];
	for (const blueprint of CONTROL_DOMAIN_BLUEPRINTS) {
		for (let i = 0; i < blueprint.count; i += 1) {
			const strategy = CONTROL_STRATEGY[i % CONTROL_STRATEGY.length];
			controls.push({
				id: `${blueprint.domain}-${String(i + 1).padStart(3, "0")}`,
				domain: blueprint.domain,
				auto: true,
				strategy,
				enabled: isControlEnabledByTier(tier, strategy),
			});
		}
	}
	return controls;
};

export function useMobileFpsGovernor(options = {}) {
	const fps = useFps();
	const battery = useBattery();
	const network = useNetwork();
	const memory = useMemory();
	const pixelRatio = useDevicePixelRatio();
	const reducedMotionPreference = usePreferredReducedMotion();

	const isMobileHint =
		options.isMobileHint ??
		(() => (typeof window !== "undefined" ? window.innerWidth <= 1024 : false));
	const lowPowerHint = options.lowPowerHint ?? false;
	const externalReducedMotionHint = options.reducedMotionHint ?? false;
	const forceTier = options.forceTier ?? null;

	const fpsSamples = ref([]);
	let sampleTimer = null;
	const startSampling = () => {
		if (sampleTimer || typeof window === "undefined") return;
		sampleTimer = window.setInterval(() => {
			const currentFps = Number(fps.value || 0);
			if (!Number.isFinite(currentFps) || currentFps <= 0) return;
			fpsSamples.value.push(currentFps);
			if (fpsSamples.value.length > 20) {
				fpsSamples.value.shift();
			}
		}, 1000);
	};
	const stopSampling = () => {
		if (sampleTimer) {
			clearInterval(sampleTimer);
			sampleTimer = null;
		}
	};

	if (getCurrentInstance()) {
		onMounted(startSampling);
		onUnmounted(stopSampling);
	}

	const fpsAverage = computed(() => {
		if (!fpsSamples.value.length) return Number(fps.value || 0) || 0;
		const total = fpsSamples.value.reduce((sum, value) => sum + value, 0);
		return total / fpsSamples.value.length;
	});

	const perfScore = computed(() => {
		let score = 100;
		const fpsValue = fpsAverage.value;
		const isMobile = resolveMaybeRefBoolean(isMobileHint);
		const lowPower = resolveMaybeRefBoolean(lowPowerHint);
		const reducedPreferenceValue = reducedMotionPreference.value;
		const reducedMotion =
			reducedPreferenceValue === "reduce" ||
			reducedPreferenceValue === true ||
			resolveMaybeRefBoolean(externalReducedMotionHint);
		const networkType = String(network.effectiveType?.value || "");
		const batteryLevel = Number(battery.level?.value ?? 1);
		const isCharging = Boolean(battery.charging?.value);
		const deviceMemory =
			typeof navigator !== "undefined"
				? Number(navigator.deviceMemory || 8)
				: 8;
		const cpuCores =
			typeof navigator !== "undefined"
				? Number(navigator.hardwareConcurrency || 8)
				: 8;
		const dpr = resolveMaybeRefNumber(pixelRatio, 1);

		if (fpsValue < 30) score -= 45;
		else if (fpsValue < 45) score -= 28;
		else if (fpsValue < 55) score -= 16;
		else if (fpsValue < 58) score -= 8;

		if (isMobile && dpr > 2.4) score -= 8;
		if (deviceMemory < 4) score -= 18;
		else if (deviceMemory < 6) score -= 10;
		if (cpuCores < 4) score -= 14;
		else if (cpuCores < 6) score -= 8;

		if (!isCharging && batteryLevel < 0.2) score -= 15;
		else if (!isCharging && batteryLevel < 0.4) score -= 8;

		if (networkType === "slow-2g" || networkType === "2g") score -= 18;
		else if (networkType === "3g") score -= 10;

		if (lowPower) score -= 18;
		if (reducedMotion) score -= 10;

		return clamp(Math.round(score), 0, 100);
	});

	const performanceTier = computed(() => {
		const forced = resolveMaybeRefString(forceTier);
		if (
			forced === "ultra" ||
			forced === "balanced" ||
			forced === "saver" ||
			forced === "critical"
		) {
			return forced;
		}
		const score = perfScore.value;
		if (score >= 75) return "ultra";
		if (score >= 55) return "balanced";
		if (score >= 35) return "saver";
		return "critical";
	});

	const settings = computed(() => {
		const tier = performanceTier.value;
		const base = TIER_SETTINGS[tier] || TIER_SETTINGS.balanced;
		return {
			...base,
			neonLod: ensureAtLeastOneNeonLod(base.neonLod),
			tier,
			score: perfScore.value,
			fpsNow: Number(fps.value || 0),
			fpsAverage: Number(fpsAverage.value || 0),
			isMobile: resolveMaybeRefBoolean(isMobileHint),
		};
	});

	const controlCatalog = computed(() =>
		buildControlCatalog(performanceTier.value),
	);
	const enabledControlCount = computed(
		() => controlCatalog.value.filter((control) => control.enabled).length,
	);

	const summary = computed(() => ({
		tier: performanceTier.value,
		score: perfScore.value,
		fpsNow: Math.round(Number(fps.value || 0)),
		fpsAverage: Math.round(Number(fpsAverage.value || 0)),
		controlCount: controlCatalog.value.length,
		enabledControlCount: enabledControlCount.value,
	}));

	const batterySnapshot = computed(() => {
		const level = Number(battery.level?.value ?? 1);
		const charging = Boolean(battery.charging?.value);
		const low = !charging && Number.isFinite(level) && level <= 0.3;
		const critical = !charging && Number.isFinite(level) && level <= 0.15;
		return {
			level: Number.isFinite(level) ? Number(level.toFixed(3)) : 1,
			charging,
			low,
			critical,
		};
	});

	const batteryAdaptiveMode = computed(() => {
		if (batterySnapshot.value.critical) return "power-saver";
		if (batterySnapshot.value.low) return "battery-safe";
		return "normal";
	});

	return {
		fps,
		fpsAverage,
		perfScore,
		performanceTier,
		settings,
		controlCatalog,
		enabledControlCount,
		summary,
		batterySnapshot,
		batteryAdaptiveMode,
	};
}
