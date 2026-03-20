/**
 * Neon Venue Signs System - Constants Module
 *
 * This module defines constant values used throughout the neon system
 * including colors, timing, intensity levels, and storage keys.
 */

// ============================================================================
// Glow Intensity Levels
// ============================================================================

/**
 * Glow intensity multipliers for different interaction states
 */
export enum GlowIntensity {
	DEFAULT = 1.0, // Base steady glow
	HOVER = 1.3, // +30% on hover
	ACTIVE = 1.6, // +60% on click/active
	HIGH_CONTRAST = 1.4, // +40% for accessibility
}

// ============================================================================
// Color Constants
// ============================================================================

/**
 * Default neutral neon color for venues without categories
 * HSL: 0, 0%, 80% (warm gray)
 */
export const DEFAULT_NEUTRAL_COLOR = {
	hsl: { h: 0, s: 0, l: 80 },
	hex: "#CCCCCC",
	rgb: { r: 204, g: 204, b: 204 },
};

/**
 * Fallback color palette for when database is unavailable
 * Pre-generated colors optimized for dark backgrounds
 */
export const FALLBACK_COLOR_PALETTE = [
	{
		hsl: { h: 180, s: 85, l: 60 },
		hex: "#33E0E0",
		rgb: { r: 51, g: 224, b: 224 },
	}, // Cyan
	{
		hsl: { h: 280, s: 80, l: 65 },
		hex: "#B366FF",
		rgb: { r: 179, g: 102, b: 255 },
	}, // Magenta
	{
		hsl: { h: 60, s: 90, l: 60 },
		hex: "#F0F033",
		rgb: { r: 240, g: 240, b: 51 },
	}, // Yellow
	{
		hsl: { h: 120, s: 75, l: 55 },
		hex: "#40E640",
		rgb: { r: 64, g: 230, b: 64 },
	}, // Green
	{
		hsl: { h: 200, s: 85, l: 60 },
		hex: "#33B3E0",
		rgb: { r: 51, g: 179, b: 224 },
	}, // Light Blue
	{
		hsl: { h: 320, s: 80, l: 65 },
		hex: "#FF66CC",
		rgb: { r: 255, g: 102, b: 204 },
	}, // Pink
	{
		hsl: { h: 40, s: 90, l: 60 },
		hex: "#F0C033",
		rgb: { r: 240, g: 192, b: 51 },
	}, // Orange
	{
		hsl: { h: 160, s: 75, l: 55 },
		hex: "#40E6B3",
		rgb: { r: 64, g: 230, b: 179 },
	}, // Teal
	{
		hsl: { h: 260, s: 80, l: 65 },
		hex: "#9966FF",
		rgb: { r: 153, g: 102, b: 255 },
	}, // Purple
	{
		hsl: { h: 140, s: 85, l: 60 },
		hex: "#33E099",
		rgb: { r: 51, g: 224, b: 153 },
	}, // Mint
];

/**
 * Golden ratio for hue distribution (137.5 degrees)
 * Used for evenly distributing colors across the spectrum
 */
export const GOLDEN_ANGLE = 137.5;

/**
 * Warm white color (avoiding pure white #FFFFFF)
 * HSL: 40, 10%, 95%
 */
export const WARM_WHITE = {
	hsl: { h: 40, s: 10, l: 95 },
	hex: "#F5F3F0",
	rgb: { r: 245, g: 243, b: 240 },
};

// ============================================================================
// Timing Constants
// ============================================================================

/**
 * Transition durations in milliseconds
 */
export const TRANSITION_DURATION = {
	FAST: 150, // Fast transitions (click/active)
	NORMAL: 200, // Normal transitions (hover)
	SLOW: 300, // Slow transitions (hover exit)
	MODAL: 250, // Modal open/close
} as const;

/**
 * Animation delays in milliseconds
 */
export const ANIMATION_DELAY = {
	LABEL_STAGGER: 50, // Stagger between label appearances
	DEBOUNCE: 300, // Debounce for map interactions
} as const;

/**
 * Cache expiration time (24 hours in milliseconds)
 */
export const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// CSS Constants
// ============================================================================

/**
 * CSS easing functions
 */
export const EASING = {
	MATERIAL: "cubic-bezier(0.4, 0.0, 0.2, 1)", // Material Design standard easing
	EASE_OUT: "cubic-bezier(0.0, 0.0, 0.2, 1)", // Deceleration curve
	EASE_IN: "cubic-bezier(0.4, 0.0, 1, 1)", // Acceleration curve
} as const;

/**
 * Blur radius range in pixels
 */
export const BLUR_RADIUS = {
	MIN: 8,
	MAX: 20,
	DEFAULT: 12,
} as const;

/**
 * Spread radius range in pixels
 */
export const SPREAD_RADIUS = {
	MIN: 0,
	MAX: 10,
	DEFAULT: 4,
} as const;

/**
 * Shadow layer count
 */
export const SHADOW_LAYERS = {
	MIN: 1,
	MAX: 5,
	DEFAULT: 3,
} as const;

// ============================================================================
// Performance Constants
// ============================================================================

/**
 * Maximum number of visible labels for performance
 */
export const MAX_VISIBLE_LABELS = 50;

/**
 * Minimum zoom level to show labels
 */
export const MIN_ZOOM_LEVEL = 13;

/**
 * Target frame rate
 */
export const TARGET_FPS = 30;

/**
 * Viewport buffer for culling (pixels)
 */
export const VIEWPORT_BUFFER = 100;

/**
 * Maximum color generation adjustment attempts
 */
export const MAX_COLOR_ADJUSTMENT_ATTEMPTS = 10;

// ============================================================================
// Priority Scoring Weights
// ============================================================================

/**
 * Weights for venue priority calculation
 */
export const PRIORITY_WEIGHTS = {
	DISTANCE: 0.4, // 40% weight for proximity
	IMPORTANCE: 0.4, // 40% weight for venue importance
	CATEGORY: 0.2, // 20% weight for category boost
} as const;

/**
 * Category boost values for popular venue types
 */
export const CATEGORY_BOOST = {
	RESTAURANT: 0.2,
	BAR: 0.2,
	CAFE: 0.15,
	SHOP: 0.1,
	DEFAULT: 0.0,
} as const;

// ============================================================================
// Storage Keys
// ============================================================================

/**
 * localStorage keys for neon system data
 */
export const STORAGE_KEYS = {
	COLOR_CACHE: "vibecity:neon:color-cache",
	USER_PREFS: "vibecity:neon:preferences",
	CACHE_VERSION: "vibecity:neon:cache-version",
} as const;

/**
 * Current cache version for invalidation
 */
export const CACHE_VERSION = "1.0.0";

// ============================================================================
// Accessibility Constants
// ============================================================================

/**
 * WCAG 2.1 AA minimum contrast ratio
 */
export const MIN_CONTRAST_RATIO = 4.5;

/**
 * Minimum perceived brightness difference
 */
export const MIN_BRIGHTNESS_DIFFERENCE = 125;

/**
 * Minimum font size for mobile (pixels)
 */
export const MIN_MOBILE_FONT_SIZE = 14;

/**
 * Mobile breakpoint (pixels)
 */
export const MOBILE_BREAKPOINT = 768;

// ============================================================================
// Error Messages
// ============================================================================

/**
 * Standard error messages for the neon system
 */
export const ERROR_MESSAGES = {
	DATABASE_FETCH_FAILED: "Failed to fetch venue categories from database",
	COLOR_GENERATION_FAILED: "Failed to generate category colors",
	CACHE_LOAD_FAILED: "Failed to load color cache from localStorage",
	CACHE_SAVE_FAILED: "Failed to save color cache to localStorage",
	INVALID_CONFIG: "Invalid neon configuration provided",
	GPU_UNAVAILABLE: "GPU acceleration unavailable, using fallback rendering",
	CSS_CUSTOM_PROPS_UNSUPPORTED:
		"CSS custom properties not supported, using inline styles",
} as const;

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Feature flag keys for neon system
 */
export const FEATURE_FLAGS = {
	NEON_ENABLED: "enable_neon_sign_map_v1",
	NEON_V2_ENABLED: "neon_sign_v2_enabled",
} as const;

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for database operations
 */
export const RETRY_CONFIG = {
	MAX_ATTEMPTS: 3,
	BACKOFF_BASE: 1000, // 1 second base delay
	BACKOFF_MULTIPLIER: 2, // Exponential backoff (1s, 2s, 4s)
} as const;
