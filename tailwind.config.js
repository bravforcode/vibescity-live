/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: '#0b0d11',
        white: '#f8f8f8ff',
      }
    },
  },
  plugins: [],
}