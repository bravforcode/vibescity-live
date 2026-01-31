// src/design-system/tailwind.preset.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        dark: "#050508", // Darker void
        void: "#030305", // Deepest black
        surface: {
          glass: "rgba(10, 10, 20, 0.50)", // Glass effect base
          light: "rgba(255, 255, 255, 0.05)", // Subtle overlay
          border: "rgba(255, 255, 255, 0.08)", // Glass border
          elevated: "rgba(20, 20, 25, 0.8)", // Dropdowns/Modals
        },
        text: {
          primary: "#ffffff",
          secondary: "rgba(255, 255, 255, 0.7)",
          muted: "rgba(255, 255, 255, 0.4)",
          brand: "#00f0ff", // Neon Cyan default
        },
        neon: {
          blue: "#00f0ff",   // Cyber Cyan
          purple: "#bc13fe", // Electric Purple
          pink: "#ff00aa",   // Hot Pink
          green: "#00ff9d",  // Matrix Green
          yellow: "#fcee0a", // Cyber Yellow
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
        "midnight-aurora": "radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.15), rgba(3, 3, 5, 0) 50%)",
      },
      boxShadow: {
        "glow": "0 0 20px rgba(188, 19, 254, 0.6)",
        "neon-blue": "0 0 10px rgba(0, 240, 255, 0.5)",
        "neon-pink": "0 0 10px rgba(255, 0, 170, 0.5)",
        "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "elevation-1": "0 2px 5px rgba(0,0,0,0.2)",
        "elevation-2": "0 4px 10px rgba(0,0,0,0.3)",
      },
      fontFamily: {
        sans: ['Outfit', 'Sarabun', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'neon-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px theme("colors.neon.pink"), 0 0 20px theme("colors.neon.pink")' },
          '50%': { boxShadow: '0 0 2px theme("colors.neon.pink"), 0 0 10px theme("colors.neon.pink")' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      },
      animation: {
        'neon-pulse': 'neon-pulse 2s infinite',
        'float': 'float 4s ease-in-out infinite',
      }
    },
  },
  plugins: [],
};
