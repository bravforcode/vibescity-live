import { sentryVitePlugin } from "@sentry/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    visualizer({ open: true, filename: "dist/stats.html", gzipSize: true }),
    sentryVitePlugin({
      org: "rawivforcode",
      project: "javascript-vue",
    }),
  ],

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
