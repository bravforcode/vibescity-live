/**
 * useAdvancedNeonEffects - Enhanced Neon Sign Effects
 *
 * Features:
 * - Dynamic glow intensity based on time of day
 * - Flicker effects for realism
 * - Color temperature shifts
 * - Pulsing animations for LIVE venues
 * - Rainbow cycling for special events
 * - Neon tube burn-in simulation
 */

import { computed, getCurrentInstance, onUnmounted, ref, watch } from "vue";
import { NEON_PALETTE_FAMILIES } from "./useNeonSignTheme";

const FLICKER_PATTERNS = [
	[1, 0.95, 1, 0.9, 1], // Subtle flicker
	[1, 0.8, 1, 0.85, 1, 0.9, 1], // Medium flicker
	[1, 0.7, 0.9, 1, 0.6, 1], // Strong flicker
];

const TIME_BASED_INTENSITY = {
	dawn: 0.3, // 05:00-07:00
	morning: 0.2, // 07:00-11:00
	noon: 0.1, // 11:00-14:00
	afternoon: 0.4, // 14:00-17:00
	dusk: 0.7, // 17:00-19:00
	evening: 1.0, // 19:00-22:00
	night: 1.0, // 22:00-05:00
};

export function useAdvancedNeonEffects(options = {}) {
	const currentTime = ref(new Date());
	const flickerEnabled = ref(options.enableFlicker !== false);
	const pulseEnabled = ref(options.enablePulse !== false);
	const rainbowMode = ref(false);

	let timeUpdateInterval = null;
	let flickerAnimationFrame = null;

	// Get time of day category
	const timeOfDay = computed(() => {
		const hour = currentTime.value.getHours();
		if (hour >= 5 && hour < 7) return "dawn";
		if (hour >= 7 && hour < 11) return "morning";
		if (hour >= 11 && hour < 14) return "noon";
		if (hour >= 14 && hour < 17) return "afternoon";
		if (hour >= 17 && hour < 19) return "dusk";
		if (hour >= 19 && hour < 22) return "evening";
		return "night";
	});

	// Base intensity based on time
	const baseIntensity = computed(() => {
		return TIME_BASED_INTENSITY[timeOfDay.value] || 1.0;
	});

	// Generate flicker effect
	const generateFlickerCSS = (paletteId, intensity = 1.0) => {
		const palette =
			NEON_PALETTE_FAMILIES.find((p) => p.id === paletteId) ||
			NEON_PALETTE_FAMILIES[0];
		const pattern =
			FLICKER_PATTERNS[Math.floor(Math.random() * FLICKER_PATTERNS.length)];

		const keyframes = pattern
			.map((opacity, index) => {
				const percent = (index / (pattern.length - 1)) * 100;
				const adjustedOpacity = opacity * intensity;
				return `${percent}% { 
				opacity: ${adjustedOpacity};
				filter: drop-shadow(0 0 ${8 * adjustedOpacity}px ${palette.glow});
			}`;
			})
			.join("\n");

		return `
			@keyframes neon-flicker-${paletteId} {
				${keyframes}
			}
		`;
	};

	// Generate pulse effect for LIVE venues
	const generatePulseCSS = (paletteId) => {
		const palette =
			NEON_PALETTE_FAMILIES.find((p) => p.id === paletteId) ||
			NEON_PALETTE_FAMILIES[0];

		return `
			@keyframes neon-pulse-${paletteId} {
				0%, 100% {
					filter: drop-shadow(0 0 8px ${palette.glow}) brightness(1);
					transform: scale(1);
				}
				50% {
					filter: drop-shadow(0 0 16px ${palette.glow}) brightness(1.2);
					transform: scale(1.05);
				}
			}
		`;
	};

	// Generate rainbow cycling effect
	const generateRainbowCSS = () => {
		const colors = NEON_PALETTE_FAMILIES.map((p) => p.frame);
		const step = 100 / colors.length;

		const keyframes = colors
			.map((color, index) => {
				return `${index * step}% { 
				color: ${color};
				filter: drop-shadow(0 0 12px ${color});
			}`;
			})
			.join("\n");

		return `
			@keyframes neon-rainbow {
				${keyframes}
			}
		`;
	};

	// Get neon styles for a venue
	const getNeonStyles = (_shop, options = {}) => {
		const {
			paletteId = "plasma-pink",
			isLive = false,
			isSelected = false,
			enableFlicker: localFlicker = flickerEnabled.value,
			enablePulse: localPulse = pulseEnabled.value,
		} = options;

		const palette =
			NEON_PALETTE_FAMILIES.find((p) => p.id === paletteId) ||
			NEON_PALETTE_FAMILIES[0];
		const intensity = baseIntensity.value;

		const styles = {
			color: palette.frame,
			textShadow: `
				0 0 4px ${palette.glow},
				0 0 8px ${palette.glow},
				0 0 12px ${palette.glow}
			`,
			filter: `drop-shadow(0 0 ${8 * intensity}px ${palette.glow})`,
		};

		// Add animations
		const animations = [];

		if (isLive && localPulse) {
			animations.push(`neon-pulse-${paletteId} 2s ease-in-out infinite`);
		}

		if (localFlicker && Math.random() > 0.7) {
			animations.push(
				`neon-flicker-${paletteId} ${2 + Math.random() * 2}s ease-in-out infinite`,
			);
		}

		if (rainbowMode.value) {
			animations.push("neon-rainbow 10s linear infinite");
		}

		if (animations.length > 0) {
			styles.animation = animations.join(", ");
		}

		// Selected state enhancement
		if (isSelected) {
			styles.filter = `drop-shadow(0 0 ${16 * intensity}px ${palette.glow}) brightness(1.3)`;
			styles.transform = "scale(1.1)";
		}

		return styles;
	};

	// Inject CSS animations
	const injectNeonCSS = () => {
		if (typeof document === "undefined") return;

		const styleId = "advanced-neon-effects";
		let styleEl = document.getElementById(styleId);

		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = styleId;
			document.head.appendChild(styleEl);
		}

		const css = [
			...NEON_PALETTE_FAMILIES.map((p) =>
				generateFlickerCSS(p.id, baseIntensity.value),
			),
			...NEON_PALETTE_FAMILIES.map((p) => generatePulseCSS(p.id)),
			generateRainbowCSS(),
			`
				@media (prefers-reduced-motion: reduce) {
					[class*="neon-"] {
						animation: none !important;
					}
				}
			`,
		].join("\n");

		styleEl.textContent = css;
	};

	// Update time periodically
	const startTimeUpdates = () => {
		timeUpdateInterval = setInterval(() => {
			currentTime.value = new Date();
		}, 60000); // Update every minute
	};

	// Initialize
	const init = () => {
		injectNeonCSS();
		startTimeUpdates();
	};

	// Cleanup
	const cleanup = () => {
		if (timeUpdateInterval) {
			clearInterval(timeUpdateInterval);
			timeUpdateInterval = null;
		}
		if (flickerAnimationFrame) {
			cancelAnimationFrame(flickerAnimationFrame);
			flickerAnimationFrame = null;
		}
	};

	// Watch for intensity changes
	watch(baseIntensity, () => {
		injectNeonCSS();
	});

	if (getCurrentInstance()) {
		onUnmounted(cleanup);
	}

	return {
		currentTime,
		timeOfDay,
		baseIntensity,
		flickerEnabled,
		pulseEnabled,
		rainbowMode,
		getNeonStyles,
		init,
		cleanup,
	};
}
