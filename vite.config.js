import { sentryVitePlugin } from "@sentry/vite-plugin";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import Sitemap from "vite-plugin-sitemap";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    vue(),
    visualizer({ open: true, filename: "dist/stats.html", gzipSize: true }),
    sentryVitePlugin({
      org: "rawivforcode",
      project: "javascript-vue",
    }),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "VibeCity - Chiang Mai Entertainment",
        short_name: "VibeCity",
        description: "Discover Chiang Mai's best nightlife, bars, and entertainment in real-time.",
        theme_color: "#0f0f1a",
        background_color: "#0f0f1a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["entertainment", "travel", "lifestyle"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/mobile-feed.png",
            sizes: "1170x2532",
            type: "image/png",
            form_factor: "narrow",
            label: "Live Feed",
          },
          {
            src: "/screenshots/desktop-map.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide",
            label: "Interactive Map",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,vue,txt,woff2}"],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /.*\.mp4$/i,
            handler: "NetworkOnly",
            options: {
              cacheName: "supabase-video-bypass",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "mapbox-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    Sitemap({
      hostname: "https://vibecity.live",
      dynamicRoutes: [
        "/",
        "/en",
        "/th",
        "/en/privacy",
        "/th/privacy",
        "/en/terms",
        "/th/terms",
        "/en/partner",
        "/th/partner",
        "/privacy",
        "/terms",
        "/partner",
      ],
      exclude: ["/admin", "/merchant"],
      changefreq: "daily",
      priority: 0.8,
      lastmod: new Date(),
    }),
  ],

  // ✅ Proxy for Local Development (matches Vercel rewrites)
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    // ถ้าอยาก “ไม่เห็น warning” ก็ปรับค่านี้ได้ (optional)
    // chunkSizeWarningLimit: 2000,

    rollupOptions: {
      output: {
        /**
         * แยก chunk แบบตั้งใจ:
         * - mapbox/gl เป็นก้อน map แยก
         * - vue runtime แยก
         * - pinia, i18n แยก
         * - ที่เหลือ vendor
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // ✅ Mapbox / map libs (ตัวพองสุดในรูป)
          if (
            id.includes("mapbox-gl") ||
            id.includes("maplibre-gl") ||
            id.includes("@mapbox") ||
            id.includes("geojson") ||
            id.includes("supercluster")
          ) {
            return "map";
          }

          // ✅ Vue ecosystem
          if (id.includes("/vue/") || id.includes("@vue/")) return "vue";

          // ✅ Pinia
          if (id.includes("pinia")) return "store";

          // ✅ i18n
          if (id.includes("vue-i18n")) return "i18n";

          // ✅ axios (เห็นอยู่ในรูปเหมือนกัน)
          if (id.includes("axios")) return "http";

          // ✅ ที่เหลือรวมเป็น vendor
          return "vendor";
        },
      },
    },

    sourcemap: true,
  },
});
