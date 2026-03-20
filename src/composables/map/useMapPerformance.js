/**
 * useMapPerformance - Advanced Performance Optimization
 *
 * Features:
 * - Adaptive LOD (Level of Detail) based on zoom
 * - Smart tile caching with memory management
 * - Frame rate monitoring and throttling
 * - Lazy loading for non-critical features
 * - GPU acceleration hints
 * - Memory pressure detection
 */

import { computed, getCurrentInstance, onUnmounted, ref, watch } from "vue";

const FPS_TARGET = 60;
const FPS_THRESHOLD_LOW = 30;
const FPS_THRESHOLD_CRITICAL = 20;
const MEMORY_PRESSURE_THRESHOLD = 0.8; // 80% of available memory

export function useMapPerformance(map, _options = {}) {
	const currentFPS = ref(60);
	const performanceMode = ref("high"); // 'high', 'medium', 'low', 'critical'
	const memoryPressure = ref(0);
	const isLowPowerMode = ref(false);

	let frameCount = 0;
	let lastFPSCheck = performance.now();
	let fpsMonitorInterval = null;
	let memoryMonitorInterval = null;

	// Adaptive LOD Configuration
	const lodConfig = computed(() => {
		const mode = performanceMode.value;
		return {
			high: {
				maxMarkers: 1000,
				clusterRadius: 40,
				enableAnimations: true,
				enableShadows: true,
				tileQuality: "high",
				renderDistance: "far",
			},
			medium: {
				maxMarkers: 500,
				clusterRadius: 50,
				enableAnimations: true,
				enableShadows: false,
				tileQuality: "medium",
				renderDistance: "medium",
			},
			low: {
				maxMarkers: 250,
				clusterRadius: 60,
				enableAnimations: false,
				enableShadows: false,
				tileQuality: "low",
				renderDistance: "near",
			},
			critical: {
				maxMarkers: 100,
				clusterRadius: 80,
				enableAnimations: false,
				enableShadows: false,
				tileQuality: "low",
				renderDistance: "near",
			},
		}[mode];
	});

	// FPS Monitoring
	const monitorFPS = () => {
		frameCount++;
		const now = performance.now();
		const elapsed = now - lastFPSCheck;

		if (elapsed >= 1000) {
			currentFPS.value = Math.round((frameCount * 1000) / elapsed);
			frameCount = 0;
			lastFPSCheck = now;

			// Adjust performance mode based on FPS
			updatePerformanceMode();
		}

		if (fpsMonitorInterval) {
			requestAnimationFrame(monitorFPS);
		}
	};

	// Update performance mode based on FPS
	const updatePerformanceMode = () => {
		const fps = currentFPS.value;

		if (fps >= FPS_TARGET) {
			if (performanceMode.value !== "high" && !isLowPowerMode.value) {
				performanceMode.value = "high";
			}
		} else if (fps >= FPS_THRESHOLD_LOW) {
			if (performanceMode.value !== "medium") {
				performanceMode.value = "medium";
			}
		} else if (fps >= FPS_THRESHOLD_CRITICAL) {
			if (performanceMode.value !== "low") {
				performanceMode.value = "low";
			}
		} else {
			performanceMode.value = "critical";
		}
	};

	// Memory Monitoring
	const monitorMemory = () => {
		if (performance.memory) {
			const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
			memoryPressure.value = usedJSHeapSize / jsHeapSizeLimit;

			// Force garbage collection hint if memory pressure is high
			if (memoryPressure.value > MEMORY_PRESSURE_THRESHOLD) {
				triggerMemoryOptimization();
			}
		}
	};

	// Trigger memory optimization
	const triggerMemoryOptimization = () => {
		if (!map.value) return;

		// Reduce tile cache size
		if (map.value.style?.sourceCaches) {
			Object.values(map.value.style.sourceCaches).forEach((cache) => {
				if (cache._tiles) {
					const tiles = Object.values(cache._tiles);
					// Remove oldest tiles beyond limit
					const limit = performanceMode.value === "critical" ? 50 : 100;
					if (tiles.length > limit) {
						tiles.slice(0, tiles.length - limit).forEach((tile) => {
							cache._removeTile?.(tile.tileID);
						});
					}
				}
			});
		}
	};

	// Adaptive tile loading based on zoom
	const getOptimalTileSize = (zoom) => {
		if (zoom < 10) return 256; // Low zoom = smaller tiles
		if (zoom < 14) return 512;
		return 512; // High zoom = standard tiles
	};

	// Throttle map updates
	let updateThrottle = null;
	const throttledMapUpdate = (callback, delay = 16) => {
		if (updateThrottle) return;
		updateThrottle = setTimeout(() => {
			callback();
			updateThrottle = null;
		}, delay);
	};

	// Detect low power mode (battery saver)
	const detectLowPowerMode = () => {
		if (navigator.getBattery) {
			navigator.getBattery().then((battery) => {
				isLowPowerMode.value = !battery.charging && battery.level < 0.2;

				battery.addEventListener("chargingchange", () => {
					isLowPowerMode.value = !battery.charging && battery.level < 0.2;
				});

				battery.addEventListener("levelchange", () => {
					isLowPowerMode.value = !battery.charging && battery.level < 0.2;
				});
			});
		}
	};

	// Apply performance optimizations to map
	const applyPerformanceSettings = () => {
		if (!map.value) return;

		const config = lodConfig.value;

		// Adjust render quality
		if (map.value.painter) {
			map.value.painter.context.gl.hint(
				map.value.painter.context.gl.GENERATE_MIPMAP_HINT,
				config.tileQuality === "high"
					? map.value.painter.context.gl.NICEST
					: map.value.painter.context.gl.FASTEST,
			);
		}

		// Adjust fade duration based on performance
		if (map.value._fadeDuration !== undefined) {
			map.value._fadeDuration = config.enableAnimations ? 300 : 0;
		}
	};

	// Start monitoring
	const startMonitoring = () => {
		detectLowPowerMode();

		fpsMonitorInterval = true;
		requestAnimationFrame(monitorFPS);

		memoryMonitorInterval = setInterval(monitorMemory, 5000);
	};

	// Stop monitoring
	const stopMonitoring = () => {
		fpsMonitorInterval = null;
		if (memoryMonitorInterval) {
			clearInterval(memoryMonitorInterval);
			memoryMonitorInterval = null;
		}
	};

	// Watch performance mode changes
	watch(performanceMode, () => {
		applyPerformanceSettings();
	});

	// Register lifecycle cleanup only when used inside component setup.
	if (getCurrentInstance()) {
		onUnmounted(() => {
			stopMonitoring();
		});
	}

	return {
		currentFPS,
		performanceMode,
		memoryPressure,
		isLowPowerMode,
		lodConfig,
		startMonitoring,
		stopMonitoring,
		throttledMapUpdate,
		getOptimalTileSize,
		triggerMemoryOptimization,
	};
}
