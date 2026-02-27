import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";

const { publicVars } = loadEnv({ prefixes: ["VITE_"] });
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [pluginVue()],
  source: {
    entry: {
      index: "./src/main.js",
    },
    define: {
      ...publicVars,
      // Inject app version from package.json at build time — single source of truth
      __APP_VERSION__: JSON.stringify(version),
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  html: {
    template: "./public/index.html",
  },
  output: {
    // Enable source maps for bundle analysis
    sourceMap: {
      js: process.env.ANALYZE === "true" ? "source-map" : false,
    },
    // Target modern browsers for smaller bundles
    target: "web",
  },
  performance: {
    // Chunk splitting for better caching
    chunkSplit: {
      strategy: "split-by-experience",
      // Force separate chunks for heavy dependencies
      forceSplitting: {
        // Split Mapbox into its own chunk (large library)
        mapbox: /node_modules[\\/]mapbox-gl/,
        // Vue ecosystem in separate chunk
        vue: /node_modules[\\/](@?vue|vue-router|pinia|vue-i18n)/,
        // Icons library
        lucide: /node_modules[\\/]lucide-vue-next/,
        // Utilities
        utils: /node_modules[\\/](@vueuse|dayjs|zod)/,
      },
    },
    // Performance hints
    bundleAnalyze: process.env.ANALYZE === "true" ? {} : undefined,
  },
});
