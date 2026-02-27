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
    },
  },
  plugins: [],
};
