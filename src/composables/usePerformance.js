import { readonly, ref } from "vue";
import { isAppDebugLoggingEnabled } from "../utils/debugFlags";

const isLowPowerMode = ref(false);
const hardwareConcurrency = ref(navigator.hardwareConcurrency || 4);
const deviceMemory = ref(navigator.deviceMemory || 8);
const isReducedMotion = ref(false);

// New reactive state for transient degradation
const isDegraded = ref(false);
let degradedResetTimer = null;
let longTaskCount = 0;
const LONG_TASK_THRESHOLD = 5; // long tasks needed to trigger degradation
const DEGRADE_DURATION_MS = 10000; // Stay degraded for 10s
// Grace period: map init causes long tasks at startup — ignore them
const STARTUP_GRACE_MS = 6000;

// Module-level guard: register the mediaQuery listener only once.
let _mediaQuery = null;
let _mediaQueryHandler = null;
let _perfObserver = null;
let _hasLoggedPerformanceDegrade = false;

const shouldLogPerformanceDebug = () =>
	import.meta.env.DEV && isAppDebugLoggingEnabled();

export function usePerformance() {
	const initPerformanceMonitoring = () => {
		// 1. Check Reduced Motion User Preference
		if (!_mediaQuery) {
			_mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
			_mediaQueryHandler = (e) => {
				isReducedMotion.value = e.matches;
			};
			_mediaQuery.addEventListener("change", _mediaQueryHandler);
		}
		isReducedMotion.value = _mediaQuery.matches;

		// 2. Hardware Heuristics
		// If <= 4 CPU cores or <= 4GB RAM, assume "Low Power"
		// Also check for specific low-end UA strings if needed (omitted for now)
		if (hardwareConcurrency.value <= 4 || deviceMemory.value <= 4) {
			isLowPowerMode.value = true;
			isDegraded.value = true; // Devices this low power should always run degraded
			if (shouldLogPerformanceDebug())
				console.log(
					"⚡️ VibeCity: Low Power Mode Activated (Hardware Heuristic)",
				);
		}

		// 3. Dynamic Performance Monitoring (Long Tasks)
		if (!isLowPowerMode.value && typeof PerformanceObserver !== "undefined") {
			try {
				if (!_perfObserver) {
					_perfObserver = new PerformanceObserver((list) => {
						const entries = list.getEntries();
						if (entries.length > 0) {
							longTaskCount += entries.length;

							// If we hit threshold, trigger degradation
							if (longTaskCount >= LONG_TASK_THRESHOLD && !isDegraded.value) {
								isDegraded.value = true;
								if (
									!_hasLoggedPerformanceDegrade &&
									shouldLogPerformanceDebug()
								) {
									_hasLoggedPerformanceDegrade = true;
									console.info(
										"📉 VibeCity: Performance degradation detected. Simplifying UI.",
									);
								}
							}

							// Always reset the counter and degradation after a cooldown
							if (degradedResetTimer) clearTimeout(degradedResetTimer);
							degradedResetTimer = setTimeout(() => {
								longTaskCount = 0;
								_hasLoggedPerformanceDegrade = false;
								// Only revert isDegraded if not hard-locked to low power
								if (!isLowPowerMode.value) {
									isDegraded.value = false;
								}
							}, DEGRADE_DURATION_MS);
						}
					});

					// Delay observation past startup to ignore map-init long tasks
					setTimeout(() => {
						try {
							_perfObserver.observe({ type: "longtask", buffered: false });
						} catch (e) {
							// ignore
						}
					}, STARTUP_GRACE_MS);
				}
			} catch (e) {
				// Ignore observer setup errors in older browsers
			}
		}
	};

	return {
		isLowPowerMode: readonly(isLowPowerMode),
		isReducedMotion: readonly(isReducedMotion),
		isDegraded: readonly(isDegraded), // Expose graceful degradation flag
		initPerformanceMonitoring,
	};
}
