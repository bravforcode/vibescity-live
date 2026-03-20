import {
	useBattery,
	useDevicePixelRatio,
	useFps,
	useMemory,
	useNetwork,
	usePreferredReducedMotion,
	useWindowSize,
} from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref } from "vue";

export function usePerformanceOptimizer() {
	// Performance monitoring
	const fps = useFps();
	const { width: windowWidth, height: windowHeight } = useWindowSize();
	const prefersReducedMotion = usePreferredReducedMotion();
	const battery = useBattery();
	const network = useNetwork();
	const pixelRatio = useDevicePixelRatio();
	const memory = useMemory();

	// Performance state
	const performanceLevel = ref("high"); // high, medium, low
	const isLowEndDevice = ref(false);
	const shouldReduceEffects = ref(false);
	const maxParticles = ref(100);
	const animationQuality = ref("high"); // high, medium, low

	// Calculate performance score based on multiple factors
	const calculatePerformanceScore = () => {
		let score = 100;

		// FPS factor (most important)
		if (fps.value < 30) score -= 40;
		else if (fps.value < 45) score -= 25;
		else if (fps.value < 55) score -= 10;

		// Device memory factor
		const deviceMemory =
			typeof navigator !== "undefined" ? navigator.deviceMemory : null;
		if (deviceMemory) {
			if (deviceMemory < 4) score -= 20;
			else if (deviceMemory < 8) score -= 10;
		}

		// CPU cores factor
		const hardwareConcurrency =
			typeof navigator !== "undefined" ? navigator.hardwareConcurrency : null;
		if (hardwareConcurrency) {
			if (hardwareConcurrency < 4) score -= 15;
			else if (hardwareConcurrency < 8) score -= 5;
		}

		// Battery factor
		if (battery.level?.value && battery.level.value < 0.2) score -= 15;
		else if (battery.level?.value && battery.level.value < 0.5) score -= 5;

		// Network factor
		if (network.effectiveType?.value) {
			if (
				network.effectiveType.value === "slow-2g" ||
				network.effectiveType.value === "2g"
			)
				score -= 20;
			else if (network.effectiveType.value === "3g") score -= 10;
		}

		// Screen size factor
		const pixelCount = windowWidth.value * windowHeight.value;
		if (pixelCount > 1920 * 1080) score -= 5; // Large screens need more power

		return Math.max(0, score);
	};

	// Update performance level based on score
	const updatePerformanceLevel = () => {
		const score = calculatePerformanceScore();

		if (score >= 70) {
			performanceLevel.value = "high";
			isLowEndDevice.value = false;
			shouldReduceEffects.value = false;
			maxParticles.value = 100;
			animationQuality.value = "high";
		} else if (score >= 40) {
			performanceLevel.value = "medium";
			isLowEndDevice.value = false;
			shouldReduceEffects.value = true;
			maxParticles.value = 50;
			animationQuality.value = "medium";
		} else {
			performanceLevel.value = "low";
			isLowEndDevice.value = true;
			shouldReduceEffects.value = true;
			maxParticles.value = 20;
			animationQuality.value = "low";
		}
	};

	// Watch for performance changes
	let performanceMonitorInterval = null;

	onMounted(() => {
		updatePerformanceLevel();

		// Monitor performance every 2 seconds
		performanceMonitorInterval = setInterval(() => {
			updatePerformanceLevel();
		}, 2000);
	});

	onUnmounted(() => {
		if (performanceMonitorInterval) {
			clearInterval(performanceMonitorInterval);
		}
	});

	// Adaptive animation settings
	const animationSettings = computed(() => {
		const baseSettings = {
			duration: 300,
			easing: "cubic-bezier(0.4, 0, 0.2, 1)",
			reducedMotion: prefersReducedMotion.value,
			quality: animationQuality.value,
		};

		switch (animationQuality.value) {
			case "high":
				return {
					...baseSettings,
					particleCount: maxParticles.value,
					updateInterval: 0, // 60fps
					enableGlow: true,
					enableBlur: true,
					enableShadows: true,
					complexTransitions: true,
				};
			case "medium":
				return {
					...baseSettings,
					particleCount: Math.floor(maxParticles.value * 0.6),
					updateInterval: 16, // ~60fps with some optimization
					enableGlow: true,
					enableBlur: false,
					enableShadows: false,
					complexTransitions: false,
				};
			case "low":
				return {
					...baseSettings,
					particleCount: Math.floor(maxParticles.value * 0.3),
					updateInterval: 33, // ~30fps
					enableGlow: false,
					enableBlur: false,
					enableShadows: false,
					complexTransitions: false,
					duration: 150, // Faster, simpler animations
				};
			default:
				return baseSettings;
		}
	});

	// Throttled requestAnimationFrame wrapper
	const createThrottledRAF = (
		callback,
		interval = animationSettings.value.updateInterval,
	) => {
		let lastTime = 0;
		let rafId = null;

		return (timestamp) => {
			if (timestamp - lastTime >= interval) {
				lastTime = timestamp;
				callback(timestamp);
			}

			if (!rafId) {
				rafId = requestAnimationFrame((ts) => {
					rafId = null;
					createThrottledRAF(callback, interval)(ts);
				});
			}
		};
	};

	return {
		// State
		fps: computed(() => Math.round(fps.value)),
		performanceLevel,
		isLowEndDevice,
		shouldReduceEffects,
		maxParticles,
		animationQuality,
		prefersReducedMotion,

		// Computed settings
		animationSettings,

		// Methods
		updatePerformanceLevel,
		createThrottledRAF,

		// Raw values for advanced usage
		battery,
		network,
		memory,
		pixelRatio,
		windowSize: { width: windowWidth, height: windowHeight },
	};
}
