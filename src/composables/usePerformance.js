import { ref, readonly } from 'vue';

const isLowPowerMode = ref(false);
const hardwareConcurrency = ref(navigator.hardwareConcurrency || 4);
const deviceMemory = ref(navigator.deviceMemory || 8);
const isReducedMotion = ref(false);

export function usePerformance() {
  const initPerformanceMonitoring = () => {
    // 1. Check Reduced Motion User Preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    isReducedMotion.value = mediaQuery.matches;
    
    // Listen for changes
    mediaQuery.addEventListener('change', (e) => {
      isReducedMotion.value = e.matches;
    });

    // 2. Hardware Heuristics
    // If <= 4 CPU cores or <= 4GB RAM, assume "Low Power"
    // Also check for specific low-end UA strings if needed (omitted for now)
    if (hardwareConcurrency.value <= 4 || deviceMemory.value <= 4) {
      isLowPowerMode.value = true;
      console.log('⚡️ VibeCity: Low Power Mode Activated (Hardware Heuristic)');
    }

    // 3. Optional: GPU Tier detection or FPS monitoring could go here
    // For now, static heuristics are safer than runtime FPS monitoring which often gives false positives during load.
  };

  return {
    isLowPowerMode: readonly(isLowPowerMode),
    isReducedMotion: readonly(isReducedMotion),
    initPerformanceMonitoring,
  };
}
