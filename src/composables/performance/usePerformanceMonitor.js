import { useFps, useMemory, useNetwork } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref } from "vue";

export function usePerformanceMonitor() {
	const fps = useFps();
	const memory = useMemory();
	const network = useNetwork();

	// Performance metrics
	const metrics = ref({
		avgFps: 60,
		minFps: 60,
		maxFps: 60,
		frameDrops: 0,
		totalFrames: 0,
		memoryUsage: 0,
		networkType: "unknown",
		isLowPerformance: false,
	});

	const performanceHistory = ref([]);
	const maxHistoryLength = 60; // Keep 60 seconds of history

	// Performance thresholds
	const PERFORMANCE_THRESHOLDS = {
		EXCELLENT: { fps: 55, memory: 70, network: "4g" },
		GOOD: { fps: 45, memory: 50, network: "3g" },
		FAIR: { fps: 30, memory: 30, network: "2g" },
		POOR: { fps: 15, memory: 15, network: "slow-2g" },
	};

	// Calculate performance score
	const performanceScore = computed(() => {
		let score = 100;

		// FPS scoring (40% weight)
		const fpsScore = Math.min((metrics.value.avgFps / 60) * 100, 100) * 0.4;
		score -= 100 - fpsScore;

		// Memory scoring (30% weight)
		const deviceMemory =
			typeof navigator !== "undefined" ? navigator.deviceMemory : null;
		if (deviceMemory) {
			const memoryScore = Math.min((deviceMemory / 8) * 100, 100) * 0.3;
			score -= 100 - memoryScore;
		}

		// Network scoring (20% weight)
		const networkScores = {
			"4g": 100,
			"3g": 75,
			"2g": 50,
			"slow-2g": 25,
		};
		const networkScore =
			(networkScores[network.effectiveType?.value] || 50) * 0.2;
		score -= 100 - networkScore;

		// Frame drops (10% weight)
		const frameDropPenalty =
			Math.min(
				(metrics.value.frameDrops / metrics.value.totalFrames) * 100,
				20,
			) * 0.1;
		score -= frameDropPenalty;

		return Math.max(0, Math.round(score));
	});

	const performanceLevel = computed(() => {
		const score = performanceScore.value;
		if (score >= 85) return "excellent";
		if (score >= 70) return "good";
		if (score >= 50) return "fair";
		if (score >= 30) return "poor";
		return "critical";
	});

	// Update metrics
	const updateMetrics = () => {
		const currentFps = fps.value;
		const currentMemory = memory.memory?.value?.usedJSHeapSize || 0;

		// Update FPS metrics
		if (currentFps < metrics.value.minFps) {
			metrics.value.minFps = currentFps;
		}
		if (currentFps > metrics.value.maxFps) {
			metrics.value.maxFps = currentFps;
		}

		// Detect frame drops
		if (currentFps < 30 && metrics.value.avgFps >= 45) {
			metrics.value.frameDrops++;
		}

		// Update running average FPS (exponential moving average)
		const alpha = 0.1;
		metrics.value.avgFps =
			alpha * currentFps + (1 - alpha) * metrics.value.avgFps;

		// Update other metrics
		metrics.value.totalFrames++;
		metrics.value.memoryUsage = currentMemory;
		metrics.value.networkType = network.effectiveType?.value || "unknown";

		// Determine if performance is low
		metrics.value.isLowPerformance = performanceScore.value < 50;

		// Add to history
		const timestamp = Date.now();
		performanceHistory.value.push({
			timestamp,
			fps: currentFps,
			memory: currentMemory,
			score: performanceScore.value,
			level: performanceLevel.value,
		});

		// Trim history
		if (performanceHistory.value.length > maxHistoryLength) {
			performanceHistory.value.shift();
		}
	};

	// Get performance recommendations
	const getRecommendations = computed(() => {
		const recommendations = [];
		const level = performanceLevel.value;

		if (level === "critical" || level === "poor") {
			recommendations.push({
				type: "critical",
				message:
					"Performance is critically low. Consider disabling animations.",
				action: "disable_animations",
			});
		}

		if (metrics.value.avgFps < 30) {
			recommendations.push({
				type: "fps",
				message: "Low FPS detected. Reduce particle effects.",
				action: "reduce_particles",
			});
		}

		const deviceMemory =
			typeof navigator !== "undefined" ? navigator.deviceMemory : null;
		if (deviceMemory && deviceMemory < 4) {
			recommendations.push({
				type: "memory",
				message: "Low memory device detected. Use minimal effects.",
				action: "minimal_effects",
			});
		}

		if (
			network.effectiveType?.value === "2g" ||
			network.effectiveType?.value === "slow-2g"
		) {
			recommendations.push({
				type: "network",
				message: "Slow network detected. Disable heavy effects.",
				action: "disable_heavy_effects",
			});
		}

		if (metrics.value.frameDrops > metrics.value.totalFrames * 0.1) {
			recommendations.push({
				type: "frame_drops",
				message: "High frame drop rate. Optimize animations.",
				action: "optimize_animations",
			});
		}

		return recommendations;
	});

	// Auto-adjust quality based on performance
	const getOptimalSettings = computed(() => {
		const level = performanceLevel.value;
		const settings = {
			particleCount: 100,
			animationQuality: "high",
			enableGlow: true,
			enableBlur: true,
			enableShadows: true,
			updateInterval: 0,
		};

		switch (level) {
			case "excellent":
				// Maximum quality
				break;

			case "good":
				settings.particleCount = 75;
				settings.animationQuality = "medium";
				settings.updateInterval = 16;
				break;

			case "fair":
				settings.particleCount = 50;
				settings.animationQuality = "medium";
				settings.enableBlur = false;
				settings.enableShadows = false;
				settings.updateInterval = 33;
				break;

			case "poor":
				settings.particleCount = 25;
				settings.animationQuality = "low";
				settings.enableGlow = false;
				settings.enableBlur = false;
				settings.enableShadows = false;
				settings.updateInterval = 50;
				break;

			case "critical":
				settings.particleCount = 10;
				settings.animationQuality = "low";
				settings.enableGlow = false;
				settings.enableBlur = false;
				settings.enableShadows = false;
				settings.updateInterval = 100;
				break;
		}

		return settings;
	});

	// Performance monitoring interval
	let monitorInterval = null;

	onMounted(() => {
		updateMetrics();
		monitorInterval = setInterval(updateMetrics, 1000); // Update every second
	});

	onUnmounted(() => {
		if (monitorInterval) {
			clearInterval(monitorInterval);
		}
	});

	return {
		// Metrics
		metrics,
		performanceScore,
		performanceLevel,
		performanceHistory,

		// Computed
		getRecommendations,
		getOptimalSettings,

		// Methods
		updateMetrics,

		// Raw values
		fps: computed(() => Math.round(fps.value)),
		memory,
		network,
	};
}
