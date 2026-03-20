/**
 * Neon Brand Configuration
 *
 * Customize neon effects to match your brand identity
 */

export const BRAND_NEON_PALETTES = {
	// VibeCity Default
	vibecity: {
		id: "vibecity-brand",
		frame: "#06b6d4", // Cyan
		glow: "rgba(6, 182, 212, 0.7)",
		accent: "#f59e0b", // Amber
		text: "#ffffff",
		subline: "#e0f2fe",
		bgTop: "#0c4a6e",
		bgBottom: "#082f49",
	},

	// Nightlife Theme
	nightlife: {
		id: "nightlife-brand",
		frame: "#ec4899", // Pink
		glow: "rgba(236, 72, 153, 0.75)",
		accent: "#8b5cf6", // Purple
		text: "#fdf4ff",
		subline: "#fce7f3",
		bgTop: "#831843",
		bgBottom: "#500724",
	},

	// Tech/Modern Theme
	tech: {
		id: "tech-brand",
		frame: "#3b82f6", // Blue
		glow: "rgba(59, 130, 246, 0.7)",
		accent: "#10b981", // Green
		text: "#f0f9ff",
		subline: "#dbeafe",
		bgTop: "#1e3a8a",
		bgBottom: "#1e40af",
	},

	// Luxury Theme
	luxury: {
		id: "luxury-brand",
		frame: "#fbbf24", // Gold
		glow: "rgba(251, 191, 36, 0.8)",
		accent: "#f59e0b", // Amber
		text: "#fffbeb",
		subline: "#fef3c7",
		bgTop: "#78350f",
		bgBottom: "#451a03",
	},

	// Eco/Nature Theme
	eco: {
		id: "eco-brand",
		frame: "#10b981", // Green
		glow: "rgba(16, 185, 129, 0.7)",
		accent: "#14b8a6", // Teal
		text: "#f0fdf4",
		subline: "#d1fae5",
		bgTop: "#064e3b",
		bgBottom: "#022c22",
	},
};

export const BRAND_ANIMATION_PRESETS = {
	// Subtle - Professional, minimal distraction
	subtle: {
		enableFlicker: false,
		enablePulse: false,
		glowLevel: "soft",
		animationSpeed: 0.5,
	},

	// Balanced - Good mix of visual appeal and performance
	balanced: {
		enableFlicker: true,
		enablePulse: true,
		glowLevel: "medium",
		animationSpeed: 1.0,
	},

	// Vibrant - Maximum visual impact
	vibrant: {
		enableFlicker: true,
		enablePulse: true,
		glowLevel: "strong",
		animationSpeed: 1.5,
	},

	// Performance - Optimized for low-end devices
	performance: {
		enableFlicker: false,
		enablePulse: false,
		glowLevel: "soft",
		animationSpeed: 0.3,
	},
};

export const BRAND_MARKER_STYLES = {
	// Default VibeCity style
	vibecity: {
		shape: "circle",
		size: "medium",
		animation: "pulse",
		colors: {
			default: "#3b82f6",
			boost: "#ef4444",
			giant: "#06b6d4",
			live: "#10b981",
		},
	},

	// Minimalist style
	minimal: {
		shape: "circle",
		size: "small",
		animation: null,
		colors: {
			default: "#6b7280",
			boost: "#ef4444",
			giant: "#3b82f6",
			live: "#10b981",
		},
	},

	// Playful style
	playful: {
		shape: "star",
		size: "medium",
		animation: "bounce",
		colors: {
			default: "#8b5cf6",
			boost: "#ec4899",
			giant: "#f59e0b",
			live: "#10b981",
		},
	},

	// Elegant style
	elegant: {
		shape: "diamond",
		size: "medium",
		animation: "float",
		colors: {
			default: "#6366f1",
			boost: "#f43f5e",
			giant: "#8b5cf6",
			live: "#14b8a6",
		},
	},
};

/**
 * Apply brand configuration
 */
export function applyBrandConfig(brandName = "vibecity") {
	const palette =
		BRAND_NEON_PALETTES[brandName] || BRAND_NEON_PALETTES.vibecity;
	const animations = BRAND_ANIMATION_PRESETS.balanced;
	const markers =
		BRAND_MARKER_STYLES[brandName] || BRAND_MARKER_STYLES.vibecity;

	return {
		neon: {
			palette,
			...animations,
		},
		markers,
	};
}

/**
 * Get brand colors for CSS variables
 */
export function getBrandCSSVariables(brandName = "vibecity") {
	const palette =
		BRAND_NEON_PALETTES[brandName] || BRAND_NEON_PALETTES.vibecity;

	return {
		"--brand-neon-frame": palette.frame,
		"--brand-neon-glow": palette.glow,
		"--brand-neon-accent": palette.accent,
		"--brand-neon-text": palette.text,
		"--brand-neon-subline": palette.subline,
		"--brand-bg-top": palette.bgTop,
		"--brand-bg-bottom": palette.bgBottom,
	};
}

/**
 * Inject brand CSS variables into document
 */
export function injectBrandStyles(brandName = "vibecity") {
	if (typeof document === "undefined") return;

	const variables = getBrandCSSVariables(brandName);
	const root = document.documentElement;

	Object.entries(variables).forEach(([key, value]) => {
		root.style.setProperty(key, value);
	});
}
