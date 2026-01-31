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
      // Project specific overrides if any (Preset handles core system)
    },
  },
  plugins: [],
};
