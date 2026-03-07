import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const noWebServer = process.env.PW_NO_WEBSERVER === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5417";
const sanitizeEnvToken = (value = "") =>
	value.trim().replace(/^['"]|['"]$/g, "");

const readEnvValueFromDotEnv = (key: string) => {
	const envCandidates = [".env.local", ".env", ".env.e2e"];
	for (const file of envCandidates) {
		try {
			const fullPath = path.resolve(process.cwd(), file);
			if (!fs.existsSync(fullPath)) continue;
			const content = fs.readFileSync(fullPath, "utf8");
			const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const match = content.match(
				new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)\\s*$`, "m"),
			);
			if (match?.[1]) {
				const value = sanitizeEnvToken(match[1]);
				if (value) return value;
			}
		} catch {
			// Ignore dotenv read errors in visual test config.
		}
	}
	return "";
};

const supabaseUrl = sanitizeEnvToken(
	process.env.VITE_SUPABASE_URL ||
		process.env.SUPABASE_URL ||
		readEnvValueFromDotEnv("VITE_SUPABASE_URL"),
);

const supabaseAnonKey = sanitizeEnvToken(
	process.env.VITE_SUPABASE_ANON_KEY ||
		process.env.SUPABASE_ANON_KEY ||
		readEnvValueFromDotEnv("VITE_SUPABASE_ANON_KEY"),
);

const mapboxToken = sanitizeEnvToken(
	process.env.VITE_MAPBOX_TOKEN ||
		process.env.MAPBOX_PUBLIC_TOKEN ||
		readEnvValueFromDotEnv("VITE_MAPBOX_TOKEN"),
);

export default defineConfig({
	testDir: "./tests/visual",
	timeout: 90_000,
	expect: {
		timeout: 20_000,
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.02,
		},
	},
	reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
	outputDir: "test-results/visual",
	use: {
		baseURL,
		serviceWorkers: "block",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	webServer: noWebServer
		? undefined
		: {
				command:
					"npm run build -- --env-mode e2e && npm run preview -- --env-mode e2e --host 0.0.0.0 --port 5417",
				url: baseURL,
				reuseExistingServer: false,
				timeout: 180_000,
				env: {
					VITE_E2E: "true",
					VITE_DISABLE_ANIMATIONS: "true",
					...(supabaseUrl
						? { VITE_SUPABASE_URL: supabaseUrl }
						: {}),
					...(supabaseAnonKey
						? { VITE_SUPABASE_ANON_KEY: supabaseAnonKey }
						: {}),
					...(mapboxToken
						? { VITE_MAPBOX_TOKEN: mapboxToken }
						: {}),
				},
			},
	projects: [
		{
			name: "Desktop Chromium",
			use: {
				...devices["Desktop Chrome"],
				browserName: "chromium",
				viewport: { width: 1440, height: 900 },
			},
		},
	],
});
