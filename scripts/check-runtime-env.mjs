#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const ENV_FILES = [".env", ".env.local"];

const required = {
  frontendVercel: [
    "VITE_API_URL",
    "VITE_WS_URL",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_MAPBOX_TOKEN",
  ],
  backendFlyApi: [
    "ENV",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "BACKEND_CORS_ORIGINS",
    "REDIS_URL",
  ],
  backendFlyWorkers: [],
  ocrSecrets: [
    "GCV_SERVICE_ACCOUNT_JSON",
    "SLIP_EXPECT_RECEIVER_NAME",
    "SLIP_EXPECT_RECEIVER_BANKS",
    "SLIP_EXPECT_RECEIVER_ACCOUNT",
    "WEBHOOK_SECRET",
  ],
};

const sources = {
  VITE_API_URL:
    "Fly API service URL (https://<app>.fly.dev)",
  VITE_WS_URL:
    "Fly API service URL + /api/v1/vibes/vibe-stream (wss://...)",
  VITE_SUPABASE_URL:
    "Supabase Dashboard -> Project Settings -> API -> Project URL",
  VITE_SUPABASE_ANON_KEY:
    "Supabase Dashboard -> API -> anon key",
  VITE_MAPBOX_TOKEN:
    "Mapbox Dashboard -> Access Tokens -> public token (pk...)",
  ENV: "Fly app env (set production in prod service)",
  SUPABASE_URL: "Supabase Project URL",
  SUPABASE_KEY: "Supabase anon key (backend uses SUPABASE_KEY)",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase service_role key",
  STRIPE_SECRET_KEY: "Stripe Dashboard -> API keys",
  BACKEND_CORS_ORIGINS:
    "JSON array including your Vercel frontend domain(s)",
  REDIS_URL: "Upstash Redis or external Redis provider",
  GCV_SERVICE_ACCOUNT_JSON:
    "Supabase Edge secret from Google SA JSON (base64)",
  SLIP_EXPECT_RECEIVER_NAME:
    "Your real receiving account name for transfer verification",
  SLIP_EXPECT_RECEIVER_BANKS:
    "Comma-separated accepted bank names",
  SLIP_EXPECT_RECEIVER_ACCOUNT: "Your real receiving account number",
  WEBHOOK_SECRET: "Generate with: openssl rand -hex 32",
};

function parseEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const merged = {};
for (const file of ENV_FILES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  Object.assign(merged, parseEnv(fs.readFileSync(full, "utf8")));
}

function isSet(key) {
  const val = merged[key];
  return typeof val === "string" && val.trim().length > 0;
}

function printSection(name, keys) {
  const missing = keys.filter((k) => !isSet(k));
  console.log(`\n[${name}]`);
  if (missing.length === 0) {
    console.log("  OK: all required vars are set in .env/.env.local");
    return;
  }

  console.log("  Missing:");
  for (const key of missing) {
    const source = sources[key] || "Source not documented";
    console.log(`  - ${key}`);
    console.log(`    source: ${source}`);
  }
}

console.log("VibeCity env readiness check");
console.log(`Scanned files: ${ENV_FILES.join(", ")}`);

printSection("Frontend (Vercel)", required.frontendVercel);
printSection("Backend API (Fly)", required.backendFlyApi);
printSection("Backend Workers (Fly)", required.backendFlyWorkers);
printSection(
  "OCR Secrets (Fly)",
  required.ocrSecrets,
);

console.log(
  "\nTip: local .env is only for local dev. Set production values in Vercel/Fly/Supabase (and GitHub Actions secrets/vars for CI).",
);
