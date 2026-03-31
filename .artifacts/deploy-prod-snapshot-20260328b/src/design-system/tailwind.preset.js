// src/design-system/tailwind.preset.js

/** @type {import('tailwindcss').Config} */
module.exports = {
	theme: {
		extend: {
			colors: {
				// Runtime-tokenized (CSS vars) for theme support.
				dark: "var(--vc-color-bg-base)", // Darker void
				void: "var(--vc-color-bg-canvas)", // Deepest black
				surface: {
					glass: "var(--vc-color-surface-glass)", // Glass effect base
					light: "rgba(255, 255, 255, 0.05)", // Subtle overlay
					border: "var(--vc-color-border-glass)", // Glass border
					elevated: "var(--vc-color-surface-elevated)", // Dropdowns/Modals
				},
				text: {
					primary: "var(--vc-color-text-primary)",
					secondary: "var(--vc-color-text-secondary)",
					muted: "var(--vc-color-text-muted)",
					brand: "var(--vc-color-brand-primary)", // Neon Cyan default
				},
				neon: {
					blue: "var(--vc-color-brand-primary)", // Cyber Cyan
					purple: "var(--vc-color-accent-purple)", // Electric Purple
					pink: "var(--vc-color-accent-pink)", // Hot Pink
					green: "var(--vc-color-accent-green)", // Matrix Green
					yellow: "var(--vc-color-accent-yellow)", // Cyber Yellow
				},
				vibe: {
					blue: "#2563eb",
					purple: "#7c3aed",
					pink: "#db2777",
				},
			},
			backgroundImage: {
				"vibe-gradient":
					"linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #db2777 100%)",
				"neon-gradient":
					"linear-gradient(135deg, #00f0ff 0%, #bc13fe 50%, #ff00aa 100%)",
				"glass-noise": "url('/assets/noise.png')",
				"midnight-aurora":
					"radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.15), rgba(3, 3, 5, 0) 50%)",
			},
			boxShadow: {
				glow: "0 0 20px rgba(188, 19, 254, 0.6)",
				"neon-blue": "var(--vc-shadow-neon-blue)",
				"neon-pink": "var(--vc-shadow-neon-pink)",
				glass: "var(--vc-shadow-glass)",
				"elevation-1": "0 2px 5px rgba(0,0,0,0.2)",
				"elevation-2": "0 4px 10px rgba(0,0,0,0.3)",
			},
			fontFamily: {
				sans: ["Inter", "Sarabun", "system-ui", "sans-serif"],
				display: ["Inter", "Sarabun", "system-ui", "sans-serif"],
				mono: ["JetBrains Mono", "Fira Code", "IBM Plex Mono", "monospace"],
			},
			backdropBlur: {
				xs: "2px",
			},
			keyframes: {
				"neon-pulse": {
					"0%, 100%": {
						boxShadow:
							'0 0 5px theme("colors.neon.pink"), 0 0 20px theme("colors.neon.pink")',
					},
					"50%": {
						boxShadow:
							'0 0 2px theme("colors.neon.pink"), 0 0 10px theme("colors.neon.pink")',
					},
				},
				float: {
					"0%, 100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-6px)" },
				},
				"press-spring": {
					"0%": { transform: "scale(1)" },
					"40%": { transform: "scale(0.92)" },
					"70%": { transform: "scale(1.04)" },
					"100%": { transform: "scale(1)" },
				},
				shimmer: {
					"0%": { backgroundPosition: "-200% 0" },
					"100%": { backgroundPosition: "200% 0" },
				},
				"slide-up-fade": {
					"0%": { opacity: "0", transform: "translateY(8px)" },
					"100%": { opacity: "1", transform: "translateY(0)" },
				},
				"glow-pulse": {
					"0%, 100%": { boxShadow: "0 0 8px rgba(188,19,254,0.4)" },
					"50%": {
						boxShadow:
							"0 0 20px rgba(188,19,254,0.7), 0 0 40px rgba(0,240,255,0.3)",
					},
				},
				"scale-in": {
					"0%": { opacity: "0", transform: "scale(0.92)" },
					"100%": { opacity: "1", transform: "scale(1)" },
				},
				wiggle: {
					"0%, 100%": { transform: "rotate(0deg)" },
					"25%": { transform: "rotate(-2deg)" },
					"75%": { transform: "rotate(2deg)" },
				},
			},
			animation: {
				"neon-pulse": "neon-pulse 2s infinite",
				float: "float 4s ease-in-out infinite",
				"press-spring": "press-spring 0.3s cubic-bezier(0.34,1.56,0.64,1)",
				shimmer: "shimmer 2s ease-in-out infinite",
				"slide-up-fade": "slide-up-fade 0.35s ease-out both",
				"glow-pulse": "glow-pulse 2.5s ease-in-out infinite",
				"scale-in": "scale-in 0.25s cubic-bezier(0.34,1.56,0.64,1)",
				wiggle: "wiggle 0.4s ease-in-out",
			},
			transitionTimingFunction: {
				standard: "cubic-bezier(0.4, 0, 0.2, 1)",
				emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
				spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
			},
			transitionDuration: {
				fast: "160ms",
				normal: "240ms",
				slow: "320ms",
				slower: "480ms",
			},
		},
	},
	plugins: [],
};
