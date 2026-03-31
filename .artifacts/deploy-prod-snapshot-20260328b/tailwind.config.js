/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  presets: [
    require('./src/design-system/tailwind.preset.js')
  ],
  theme: {
    extend: {
      // Runtime typography tokens (Entertainment map theme)
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "Sarabun", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "Inter",
          "Sarabun",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "Fira Code",
          "IBM Plex Mono",
          "monospace",
        ],
      },
      fontSize: {
        "fluid-xs": ["clamp(0.75rem, 0.7rem + 0.22vw, 0.875rem)", { lineHeight: "1.35" }],
        "fluid-sm": ["clamp(0.875rem, 0.8rem + 0.28vw, 1rem)", { lineHeight: "1.45" }],
        "fluid-base": ["clamp(1rem, 0.9rem + 0.38vw, 1.125rem)", { lineHeight: "1.5" }],
        "fluid-lg": ["clamp(1.125rem, 1rem + 0.62vw, 1.375rem)", { lineHeight: "1.35" }],
        "fluid-xl": ["clamp(1.25rem, 1.05rem + 0.9vw, 1.75rem)", { lineHeight: "1.2" }],
      },
    },
  },
  plugins: [require("@tailwindcss/container-queries")],
};
