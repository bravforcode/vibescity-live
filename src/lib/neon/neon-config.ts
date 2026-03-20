/**
 * Neon Venue Signs System - Configuration Module
 *
 * This module defines TypeScript interfaces and default configuration
 * for the neon glow effects system used throughout the application.
 */

import { z } from "zod";

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * HSL color representation
 */
export interface HSLColor {
	h: number; // Hue: 0-360 degrees
	s: number; // Saturation: 0-100%
	l: number; // Lightness: 0-100%
}

/**
 * RGB color representation
 */
export interface RGBColor {
	r: number; // Red: 0-255
	g: number; // Green: 0-255
	b: number; // Blue: 0-255
}

/**
 * Complete neon color with multiple format representations
 */
export interface NeonColor {
	hsl: HSLColor;
	hex: string;
	rgb: RGBColor;
}

/**
 * Category color with full metadata (flattened structure)
 */
export interface CategoryColor {
	categoryId: string;
	categoryName: string;
	hsl: { h: number; s: number; l: number };
	hex: string;
	rgb: { r: number; g: number; b: number };
	generatedAt: number;
}

/**
 * Category-to-color mapping with metadata (nested structure)
 */
export interface CategoryColorMapping {
	categoryId: string;
	color: NeonColor;
	generatedAt: number;
}

/**
 * Glow effect configuration
 */
export interface GlowConfig {
	baseBlur: number; // Base blur radius in pixels
	baseSpread: number; // Base spread radius in pixels
	layerCount: number; // Number of shadow layers
	transitionDuration: number; // Transition duration in milliseconds
	transitionEasing: string; // CSS easing function
}

/**
 * Color generation configuration
 */
export interface ColorGenerationConfig {
	minHueDifference: number; // Minimum hue difference in degrees
	minDeltaE: number; // Minimum perceptual color difference
	saturationRange: [number, number]; // Saturation range [min, max]
	lightnessRange: [number, number]; // Lightness range [min, max]
	excludedHueRanges: [number, number][]; // Hue ranges to exclude
}

/**
 * Label display configuration
 */
export interface LabelConfig {
	maxVisible: number; // Maximum number of visible labels
	minZoomLevel: number; // Minimum zoom level to show labels
	fadeInStagger: number; // Stagger delay for fade-in animation (ms)
}

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
	enableGPUAcceleration: boolean; // Enable GPU-accelerated rendering
	targetFPS: number; // Target frame rate
	debounceDelay: number; // Debounce delay for recalculations (ms)
}

/**
 * Complete neon system configuration
 */
export interface NeonConfig {
	enabled: boolean;
	glow: GlowConfig;
	colors: ColorGenerationConfig;
	labels: LabelConfig;
	performance: PerformanceConfig;
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * HSL color schema
 */
export const HSLColorSchema = z.object({
	h: z.number().min(0).max(360),
	s: z.number().min(0).max(100),
	l: z.number().min(0).max(100),
});

/**
 * RGB color schema
 */
export const RGBColorSchema = z.object({
	r: z.number().int().min(0).max(255),
	g: z.number().int().min(0).max(255),
	b: z.number().int().min(0).max(255),
});

/**
 * Neon color schema
 */
export const NeonColorSchema = z.object({
	hsl: HSLColorSchema,
	hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	rgb: RGBColorSchema,
});

/**
 * Glow configuration schema
 */
export const GlowConfigSchema = z.object({
	baseBlur: z.number().min(0).max(50),
	baseSpread: z.number().min(0).max(20),
	layerCount: z.number().int().min(1).max(5),
	transitionDuration: z.number().min(0).max(1000),
	transitionEasing: z.string(),
});

/**
 * Color generation configuration schema
 */
export const ColorGenerationConfigSchema = z.object({
	minHueDifference: z.number().min(0).max(360),
	minDeltaE: z.number().min(0).max(100),
	saturationRange: z.tuple([
		z.number().min(0).max(100),
		z.number().min(0).max(100),
	]),
	lightnessRange: z.tuple([
		z.number().min(0).max(100),
		z.number().min(0).max(100),
	]),
	excludedHueRanges: z.array(
		z.tuple([z.number().min(0).max(360), z.number().min(0).max(360)]),
	),
});

/**
 * Label configuration schema
 */
export const LabelConfigSchema = z.object({
	maxVisible: z.number().int().min(1).max(200),
	minZoomLevel: z.number().min(0).max(22),
	fadeInStagger: z.number().min(0).max(500),
});

/**
 * Performance configuration schema
 */
export const PerformanceConfigSchema = z.object({
	enableGPUAcceleration: z.boolean(),
	targetFPS: z.number().min(15).max(120),
	debounceDelay: z.number().min(0).max(1000),
});

/**
 * Complete neon configuration schema
 */
export const NeonConfigSchema = z.object({
	enabled: z.boolean(),
	glow: GlowConfigSchema,
	colors: ColorGenerationConfigSchema,
	labels: LabelConfigSchema,
	performance: PerformanceConfigSchema,
});

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default neon system configuration
 *
 * These values are optimized for:
 * - Visual quality on dark backgrounds
 * - Performance (30+ FPS with 50 labels)
 * - Accessibility (WCAG 2.1 AA compliance)
 * - Perceptual color differentiation
 */
export const DEFAULT_NEON_CONFIG: NeonConfig = {
	enabled: true,

	glow: {
		baseBlur: 12, // 12px blur for optimal glow
		baseSpread: 4, // 4px spread for depth
		layerCount: 3, // 3 layers for rich effect
		transitionDuration: 200, // 200ms for smooth transitions
		transitionEasing: "cubic-bezier(0.4, 0.0, 0.2, 1)", // Material Design easing
	},

	colors: {
		minHueDifference: 30, // 30° minimum hue separation
		minDeltaE: 30, // ΔE 30 for perceptual difference
		saturationRange: [70, 100], // High saturation for vibrancy
		lightnessRange: [50, 70], // Optimized for dark backgrounds
		excludedHueRanges: [[0, 20]], // Exclude red spectrum (alarm association)
	},

	labels: {
		maxVisible: 50, // Limit to 50 for performance
		minZoomLevel: 13, // Show labels at zoom 13+
		fadeInStagger: 50, // 50ms stagger for smooth appearance
	},

	performance: {
		enableGPUAcceleration: true, // Use GPU for rendering
		targetFPS: 30, // Target 30 FPS minimum
		debounceDelay: 300, // 300ms debounce for map interactions
	},
};

/**
 * Validates a configuration object against the schema
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration or throws ZodError
 */
export function validateNeonConfig(config: unknown): NeonConfig {
	return NeonConfigSchema.parse(config) as NeonConfig;
}

/**
 * Validates a configuration object and returns default values for invalid fields
 *
 * @param config - Configuration object to validate
 * @returns Valid configuration with defaults for invalid fields
 */
export function validateNeonConfigSafe(config: unknown): NeonConfig {
	const result = NeonConfigSchema.safeParse(config);

	if (result.success) {
		return result.data as NeonConfig;
	}

	// Log validation errors in development
	if (import.meta.env.DEV) {
		console.warn(
			"⚠️ Invalid neon configuration, using defaults:",
			result.error.issues,
		);
	}

	return DEFAULT_NEON_CONFIG;
}
