import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { injectManifest } from "workbox-build";

const { publicVars } = loadEnv({ prefixes: ["VITE_"] });
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
	version: string;
};
const DEV_SERVER_PORT = Number(process.env.PORT || 5173);
const DEV_HMR_PORT = process.env.RSBUILD_HMR_PORT
	? Number(process.env.RSBUILD_HMR_PORT)
	: undefined;
const DEV_API_PROXY_TARGET =
	process.env.RSBUILD_API_PROXY_TARGET ||
	process.env.BACKEND_ORIGIN ||
	`http://127.0.0.1:${process.env.BACKEND_PORT || "8000"}`;

export default defineConfig({
	plugins: [
		pluginVue(),
		{
			name: "vite-plugin-pwa-compat",
			setup(api) {
				api.onAfterBuild(async () => {
					if (process.env.NODE_ENV === "development") return;
					console.log(
						"[PWA] Injecting precache manifest into service worker...",
					);
					try {
						const { count, size } = await injectManifest({
							swSrc: "./public/sw.js",
							swDest: "./dist/sw.js",
							globDirectory: "./dist",
							globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
							maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
						});
						console.log(
							`[PWA] Successfully injected ${count} files (${(size / 1024 / 1024).toFixed(2)} MB).`,
						);
					} catch (e) {
						console.error("[PWA] Workbox error:", e);
					}
				});
			},
		},
	],
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
	dev: {
		// Disable Rsbuild's default lazy-compilation in dev.
		// It was compiling async chunks on-demand, which caused HMR reload churn,
		// async component timeouts, and transient "factory is undefined" errors.
		lazyCompilation: false,
		// Keep HMR on a stable, explicit websocket endpoint so pages opened
		// through another local origin or proxy do not fall back to the wrong port.
		client: {
			protocol: "ws",
			...(process.env.RSBUILD_HMR_HOST
				? { host: process.env.RSBUILD_HMR_HOST }
				: {}),
			...(Number.isFinite(DEV_HMR_PORT) ? { port: DEV_HMR_PORT } : {}),
			path: "/rsbuild-hmr",
			overlay: true,
			reconnect: 100,
			logLevel: process.env.RSBUILD_HMR_LOG_LEVEL || "warn",
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
	server: {
		port: DEV_SERVER_PORT,
		strictPort: true,
		// Vue Router uses createWebHistory(), so deep links like /th or /en/venue/:id
		// must resolve to index.html instead of returning a dev-server 404.
		historyApiFallback: true,
		proxy: {
			"/api": {
				target: DEV_API_PROXY_TARGET,
				changeOrigin: true,
				secure: false,
			},
		},
	},
	output: {
		// Enable source maps for bundle analysis
		sourceMap: {
			js: process.env.ANALYZE === "true" ? "source-map" : false,
		},
		// Target modern browsers for smaller bundles
		target: "web",
		// Modern browser targets — eliminates legacy polyfills (~5-10% bundle reduction)
		overrideBrowserslist: [
			"chrome >= 87",
			"firefox >= 78",
			"safari >= 14",
			"edge >= 88",
		],
		// Strip license comment files from dist
		legalComments: "none",
	},
	performance: {
		// Chunk splitting for better caching
		chunkSplit: {
			strategy: "split-by-experience",
			// Force separate chunks for heavy dependencies
			forceSplitting: {
				// Split MapLibre GL into its own chunk (large library — key must match actual package name)
				maplibre: /node_modules[\\/]maplibre-gl/,
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
