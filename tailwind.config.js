/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    // ถ้ามีไฟล์ template/อื่น ๆ เพิ่มเติมค่อยเปิด
    // "./src/**/*.{html,md}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#050508", // Darker void
        void: "#030305", // Deepest black
        surface: {
            glass: "rgba(10, 10, 20, 0.50)", // More transparent
            light: "rgba(255, 255, 255, 0.05)",
            border: "rgba(255, 255, 255, 0.08)",
        },
        text: {
            primary: "#ffffff",
            secondary: "rgba(255, 255, 255, 0.7)",
            muted: "rgba(255, 255, 255, 0.4)",
        },
        neon: {
          blue: "#00f0ff",
          purple: "#bc13fe",
          pink: "#ff00aa",
          green: "#00ff9d",
        },
        vibe: {
          blue: "#2563eb",
          purple: "#7c3aed",
          pink: "#db2777",
        },
      },
      backgroundImage: {
        "vibe-gradient": "linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #db2777 100%)",
        "neon-gradient": "linear-gradient(135deg, #00f0ff 0%, #bc13fe 50%, #ff00aa 100%)",
        "glass-noise": "url('/assets/noise.png')",
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'neon-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px theme("colors.neon.pink"), 0 0 20px theme("colors.neon.pink")' },
          '50%': { boxShadow: '0 0 2px theme("colors.neon.pink"), 0 0 10px theme("colors.neon.pink")' },
        }
      },
      animation: {
        'neon-pulse': 'neon-pulse 2s infinite',
      }
    },
  },
  plugins: [],
};
