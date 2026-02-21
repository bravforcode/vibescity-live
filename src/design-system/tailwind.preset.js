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
				sans: ["Prompt", "Sarabun", "system-ui", "sans-serif"],
				display: ["Chakra Petch", "Prompt", "Sarabun", "sans-serif"],
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
			},
			animation: {
				"neon-pulse": "neon-pulse 2s infinite",
				float: "float 4s ease-in-out infinite",
			},
		},
	},
	plugins: [],
};
