import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { injectManifest } from "workbox-build";

const { publicVars } = loadEnv({ prefixes: ["VITE_"] });
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
	version: string;
};

export default defineConfig({
	server: {
		historyApiFallback: {
			rewrites: [
				{
					from: /^\/(?:en|th)(?:\/.*)?$/,
					to: "/index.html",
				},
				{
					from: /^\/(?:v|venue|c)\/.*$/,
					to: "/index.html",
				},
				{
					from: /^\/(?:privacy|terms)$/,
					to: "/index.html",
				},
			],
		},
	},
	dev: {
		client: {
			logLevel: "silent",
		},
	},
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
							// offline.html is manually precached in public/sw.js.
							globIgnores: ["offline.html"],
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
			__INTLIFY_JIT_COMPILATION__: true,
			__INTLIFY_DROP_MESSAGE_COMPILER__: false,
		},
	},
	resolve: {
		alias: {
			"@": "./src",
			// Runtime-only build is enough because src/i18n.js precompiles locale strings.
			"vue-i18n": "vue-i18n/dist/vue-i18n.runtime.esm-bundler.js",
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
				// Split MapLibre GL into its own chunk (large library, ~1MB)
				maplibre: /node_modules[\\/]maplibre-gl/,
				// Vue ecosystem in separate chunk
				vue: /node_modules[\\/](@?vue|vue-router|pinia|vue-i18n)/,
				// Icons library
				lucide: /node_modules[\\/]lucide-vue-next/,
				// Iconify JSON icons (large, rarely changes)
				iconify: /node_modules[\\/]@iconify/,
				// Utilities
				utils: /node_modules[\\/](@vueuse|dayjs|zod)/,
				// Deferrable global animations
				"vibe-animations": /src[\\/]assets[\\/]vibe-animations\.css/,
			},
		},
		// Performance hints
		bundleAnalyze: process.env.ANALYZE === "true" ? {} : undefined,
	},
});
