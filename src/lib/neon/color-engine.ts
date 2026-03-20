/**
 * Neon Venue Signs System - Category Color Engine
 *
 * This module implements the core color generation algorithm for venue categories.
 * It generates unique, perceptually distinct neon colors using HSL color space with
 * golden ratio distribution for even spacing across the spectrum.
 *
 * Key Features:
 * - Golden ratio (137.5°) hue distribution for optimal color spacing
 * - Perceptual color difference validation using ΔE (CIE76)
 * - Red spectrum exclusion [0, 20] degrees
 * - Saturation jitter (±5%) for visual variety
 * - Automatic conflict resolution for similar colors
 *
 * Validates: Requirements 2.1, 2.3, 2.4, 11.1, 11.2
 */

import type { HSLColor, NeonColor, RGBColor } from "./neon-config";
import { DEFAULT_NEUTRAL_COLOR, GOLDEN_ANGLE } from "./neon-constants";

// ============================================================================
// Color Conversion Utilities
// ============================================================================

/**
 * Converts HSL color to RGB color space
 *
 * @param hsl - HSL color object
 * @returns RGB color object with values 0-255
 */
export function hslToRgb(hsl: HSLColor): RGBColor {
	const h = hsl.h / 360;
	const s = hsl.s / 100;
	const l = hsl.l / 100;

	let r: number, g: number, b: number;

	if (s === 0) {
		// Achromatic (gray)
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number): number => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255),
	};
}

/**
 * Converts RGB color to hexadecimal string
 *
 * @param rgb - RGB color object
 * @returns Hexadecimal color string (e.g., "#FF5733")
 */
export function rgbToHex(rgb: RGBColor): string {
	const toHex = (n: number): string => {
		const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
		return hex.length === 1 ? `0${hex}` : hex;
	};

	return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

/**
 * Converts a hexadecimal color string to RGB
 *
 * @param hex - Hex color string (e.g., "#FF5733" or "FF5733")
 * @returns RGB color object
 */
export function hexToRgb(hex: string): RGBColor {
	const clean = hex.replace("#", "");
	return {
		r: parseInt(clean.substring(0, 2), 16),
		g: parseInt(clean.substring(2, 4), 16),
		b: parseInt(clean.substring(4, 6), 16),
	};
}

/**
 * Converts RGB color to HSL color space
 *
 * @param rgb - RGB color object
 * @returns HSL color object
 */
export function rgbToHsl(rgb: RGBColor): HSLColor {
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (delta !== 0) {
		s = delta / (1 - Math.abs(2 * l - 1));

		if (max === r) {
			h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
		} else if (max === g) {
			h = ((b - r) / delta + 2) / 6;
		} else {
			h = ((r - g) / delta + 4) / 6;
		}
	}

	return {
		h: Math.round(h * 360 * 10) / 10,
		s: Math.round(s * 100 * 10) / 10,
		l: Math.round(l * 100 * 10) / 10,
	};
}

/**
 * Converts a hexadecimal color string to HSL (used for cache deserialization)
 *
 * @param hex - Hex color string (e.g., "#FF5733")
 * @returns HSL color object
 */
export function hexToHsl(hex: string): HSLColor {
	return rgbToHsl(hexToRgb(hex));
}

/**
 * Converts HSL color to complete NeonColor object with all formats
 *
 * @param hsl - HSL color object
 * @returns Complete NeonColor with HSL, RGB, and hex representations
 */
export function hslToNeonColor(hsl: HSLColor): NeonColor {
	const rgb = hslToRgb(hsl);
	const hex = rgbToHex(rgb);

	return { hsl, rgb, hex };
}

// ============================================================================
// Perceptual Color Difference (ΔE CIE76)
// ============================================================================

/**
 * Converts RGB to LAB color space for perceptual difference calculation
 *
 * @param rgb - RGB color object
 * @returns LAB color object
 */
function rgbToLab(rgb: RGBColor): { l: number; a: number; b: number } {
	// Convert RGB to XYZ
	let r = rgb.r / 255;
	let g = rgb.g / 255;
	let b = rgb.b / 255;

	// Apply gamma correction
	r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
	g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
	b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;

	// Convert to XYZ (D65 illuminant)
	const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100;
	const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) * 100;
	const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) * 100;

	// Convert XYZ to LAB
	const xn = 95.047;
	const yn = 100.0;
	const zn = 108.883;

	const fx =
		x / xn > 0.008856 ? (x / xn) ** (1 / 3) : (7.787 * x) / xn + 16 / 116;
	const fy =
		y / yn > 0.008856 ? (y / yn) ** (1 / 3) : (7.787 * y) / yn + 16 / 116;
	const fz =
		z / zn > 0.008856 ? (z / zn) ** (1 / 3) : (7.787 * z) / zn + 16 / 116;

	const l = 116 * fy - 16;
	const a = 500 * (fx - fy);
	const bLab = 200 * (fy - fz);

	return { l, a, b: bLab };
}

/**
 * Calculates perceptual color difference using ΔE (CIE76) formula
 *
 * ΔE < 1: Not perceptible by human eyes
 * ΔE 1-2: Perceptible through close observation
 * ΔE 2-10: Perceptible at a glance
 * ΔE 11-49: Colors are more similar than opposite
 * ΔE 100: Colors are exact opposite
 *
 * For neon signs, we require ΔE ≥ 30 for clear differentiation
 *
 * @param color1 - First neon color
 * @param color2 - Second neon color
 * @returns ΔE value (higher = more different)
 */
export function calculateDeltaE(color1: NeonColor, color2: NeonColor): number {
	const lab1 = rgbToLab(color1.rgb);
	const lab2 = rgbToLab(color2.rgb);

	const deltaL = lab1.l - lab2.l;
	const deltaA = lab1.a - lab2.a;
	const deltaB = lab1.b - lab2.b;

	return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}

// ============================================================================
// Color Generation Algorithm
// ============================================================================

/**
 * Checks if a hue value falls within the excluded red spectrum [0, 20] degrees
 *
 * @param hue - Hue value in degrees (0-360)
 * @returns True if hue is in excluded range
 */
export function isInExcludedRange(hue: number): boolean {
	// Normalize hue to 0-360 range
	const normalizedHue = ((hue % 360) + 360) % 360;
	return normalizedHue >= 0 && normalizedHue <= 20;
}

/**
 * Generates a random saturation jitter value (±5%)
 *
 * @returns Jitter value between -5 and +5
 */
function generateSaturationJitter(): number {
	return Math.random() * 10 - 5; // Random value between -5 and +5
}

/**
 * Generates the next hue value using golden ratio distribution
 *
 * The golden angle (137.5°) provides optimal spacing for sequential colors,
 * ensuring even distribution across the color spectrum without clustering.
 *
 * @param index - Color index (0-based)
 * @param startHue - Starting hue offset (default: 180 for cyan)
 * @returns Hue value in degrees (0-360)
 */
export function generateGoldenRatioHue(
	index: number,
	startHue: number = 180,
): number {
	// Start at cyan (180°) and add golden angle increments
	const hue = (startHue + index * GOLDEN_ANGLE) % 360;
	return hue;
}

/**
 * Adjusts hue to avoid excluded red spectrum [0, 20] degrees
 *
 * If hue falls in excluded range, shifts it to 25° (orange-yellow boundary)
 *
 * @param hue - Original hue value
 * @returns Adjusted hue value avoiding excluded range
 */
export function adjustHueForExclusion(hue: number): number {
	if (isInExcludedRange(hue)) {
		// Shift to just outside the excluded range
		return 25;
	}
	return hue;
}

/**
 * Generates a neon color for a specific index with constraints applied
 *
 * Applies:
 * - Golden ratio hue distribution
 * - Red spectrum exclusion [0, 20]
 * - Saturation range [70, 100] with ±5% jitter
 * - Lightness range [50, 70]
 *
 * @param index - Color index for golden ratio calculation
 * @param config - Color generation configuration
 * @returns Generated neon color
 */
export function generateColorAtIndex(
	index: number,
	config: {
		saturationRange: [number, number];
		lightnessRange: [number, number];
	} = {
		saturationRange: [70, 100],
		lightnessRange: [50, 70],
	},
): NeonColor {
	// Generate hue using golden ratio
	let hue = generateGoldenRatioHue(index);

	// Adjust hue to avoid excluded red spectrum
	hue = adjustHueForExclusion(hue);

	// Generate saturation with jitter
	const [minSat, maxSat] = config.saturationRange;
	const baseSaturation = minSat + (maxSat - minSat) * 0.5; // Middle of range
	const jitter = generateSaturationJitter();
	const saturation = Math.max(
		minSat,
		Math.min(maxSat, baseSaturation + jitter),
	);

	// Generate lightness (middle of range for consistency)
	const [minLight, maxLight] = config.lightnessRange;
	const lightness = minLight + (maxLight - minLight) * 0.5;

	const hsl: HSLColor = {
		h: Math.round(hue * 10) / 10, // Round to 1 decimal place
		s: Math.round(saturation * 10) / 10,
		l: Math.round(lightness * 10) / 10,
	};

	return hslToNeonColor(hsl);
}

/**
 * Validates if a color meets all generation constraints
 *
 * @param color - Color to validate
 * @param config - Configuration with constraint ranges
 * @returns Validation result with errors if any
 */
export function validateColor(
	color: NeonColor,
	config: {
		saturationRange: [number, number];
		lightnessRange: [number, number];
	},
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	const { h, s, l } = color.hsl;
	const [minSat, maxSat] = config.saturationRange;
	const [minLight, maxLight] = config.lightnessRange;

	if (s < minSat || s > maxSat) {
		errors.push(`Saturation ${s} outside range [${minSat}, ${maxSat}]`);
	}

	if (l < minLight || l > maxLight) {
		errors.push(`Lightness ${l} outside range [${minLight}, ${maxLight}]`);
	}

	if (isInExcludedRange(h)) {
		errors.push(`Hue ${h} in excluded red spectrum [0, 20]`);
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Checks if a new color conflicts with existing colors based on ΔE threshold
 *
 * @param newColor - Color to check
 * @param existingColors - Array of existing colors
 * @param minDeltaE - Minimum required ΔE (default: 30)
 * @returns Conflict information
 */
export function checkColorConflict(
	newColor: NeonColor,
	existingColors: NeonColor[],
	minDeltaE: number = 30,
): { hasConflict: boolean; conflictingColor?: NeonColor; deltaE?: number } {
	for (const existingColor of existingColors) {
		const deltaE = calculateDeltaE(newColor, existingColor);
		if (deltaE < minDeltaE) {
			return {
				hasConflict: true,
				conflictingColor: existingColor,
				deltaE,
			};
		}
	}

	return { hasConflict: false };
}

/**
 * Finds the best available color by scanning the full HSL space (hue × lightness)
 * in fine steps, returning the candidate with the maximum minimum-ΔE to all
 * existing colors.
 *
 * Scanning both hue AND lightness gives far more candidate colors than hue alone,
 * which is critical when many categories must all be ≥ 30 ΔE apart.
 *
 * @param baseColor - Original color with conflict
 * @param existingColors - Array of existing colors to avoid
 * @param minDeltaE - Minimum required ΔE
 * @param saturationRange - Allowed saturation range [min, max]
 * @param lightnessRange - Allowed lightness range [min, max]
 * @returns Adjusted color with best available hue/lightness
 */
export function resolveColorConflict(
	baseColor: NeonColor,
	existingColors: NeonColor[],
	minDeltaE: number = 30,
	saturationRange: [number, number] = [70, 100],
	lightnessRange: [number, number] = [50, 70],
): NeonColor {
	// Fast path: no conflict
	if (!checkColorConflict(baseColor, existingColors, minDeltaE).hasConflict) {
		return baseColor;
	}

	// Scan hue × saturation × lightness space to find the candidate with the
	// largest minimum-ΔE gap to all existing colors.
	const HUE_STEP = 2; // 180 hue candidates (every 2°)
	const SAT_STEPS = [
		saturationRange[0],
		(saturationRange[0] + saturationRange[1]) / 2,
		saturationRange[1],
	];
	const LIGHT_STEP = 2; // fine lightness steps within allowed range

	let bestColor = baseColor;
	let bestMinDeltaE = -1;

	outer: for (let hue = 0; hue < 360; hue += HUE_STEP) {
		const candidateHue = adjustHueForExclusion(hue);

		for (const sat of SAT_STEPS) {
			for (let l = lightnessRange[0]; l <= lightnessRange[1]; l += LIGHT_STEP) {
				const candidate = hslToNeonColor({
					h: Math.round(candidateHue * 10) / 10,
					s: Math.round(sat * 10) / 10,
					l: Math.round(l * 10) / 10,
				});

				// Compute the minimum ΔE this candidate has against all existing colors
				let minDE = Infinity;
				for (const existing of existingColors) {
					const de = calculateDeltaE(candidate, existing);
					if (de < minDE) minDE = de;
					if (minDE <= bestMinDeltaE) break; // prune: can't beat current best
				}

				if (minDE > bestMinDeltaE) {
					bestMinDeltaE = minDE;
					bestColor = candidate;
					if (bestMinDeltaE >= minDeltaE) break outer; // good enough — stop all loops
				}
			}
		}
	}

	if (
		bestMinDeltaE < minDeltaE &&
		typeof import.meta !== "undefined" &&
		import.meta.env?.DEV
	) {
		console.warn(
			`⚠️ Could not find a color with ΔE ≥ ${minDeltaE}. ` +
				`Best achievable ΔE = ${bestMinDeltaE.toFixed(2)}. ` +
				`Consider reducing the number of categories or lowering minDeltaE.`,
		);
	}

	return bestColor;
}

/**
 * Generates an array of unique, perceptually distinct neon colors
 *
 * This is the main color generation function that:
 * 1. Generates colors using golden ratio distribution
 * 2. Validates each color against constraints
 * 3. Checks for perceptual conflicts (ΔE < minDeltaE)
 * 4. Resolves conflicts by scanning the full hue spectrum for the best gap
 *
 * Implementation note: saturation jitter is intentionally disabled here so
 * that `resolveColorConflict` can compare colors on a level playing field.
 * Jitter is only applied when generating standalone preview colors.
 *
 * @param count - Number of colors to generate
 * @param config - Color generation configuration
 * @returns Array of generated neon colors
 */
export function generateNeonColors(
	count: number,
	config: {
		saturationRange: [number, number];
		lightnessRange: [number, number];
		minDeltaE: number;
	} = {
		saturationRange: [70, 100],
		lightnessRange: [50, 70],
		minDeltaE: 30,
	},
): NeonColor[] {
	const colors: NeonColor[] = [];

	// Use fixed saturation/lightness (midpoint of range) so that hue is the
	// only variable — this maximises the achievable ΔE between colors.
	const [minSat, maxSat] = config.saturationRange;
	const [minLight, maxLight] = config.lightnessRange;
	const fixedSaturation = Math.round(((minSat + maxSat) / 2) * 10) / 10;
	const fixedLightness = Math.round(((minLight + maxLight) / 2) * 10) / 10;

	for (let i = 0; i < count; i++) {
		// Generate initial hue using golden ratio
		let hue = generateGoldenRatioHue(i);
		hue = adjustHueForExclusion(hue);

		let color = hslToNeonColor({
			h: hue,
			s: fixedSaturation,
			l: fixedLightness,
		});

		// Check for conflicts with existing colors and resolve if needed
		const conflict = checkColorConflict(color, colors, config.minDeltaE);
		if (conflict.hasConflict) {
			color = resolveColorConflict(
				color,
				colors,
				config.minDeltaE,
				config.saturationRange,
				config.lightnessRange,
			);
		}

		colors.push(color);
	}

	return colors;
}

/**
 * Gets the default neutral color for venues without categories
 *
 * @returns Default neutral neon color (warm gray)
 */
export function getDefaultNeutralColor(): NeonColor {
	return DEFAULT_NEUTRAL_COLOR;
}
