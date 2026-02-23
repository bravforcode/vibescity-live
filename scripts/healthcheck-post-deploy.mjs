#!/usr/bin/env node
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";

const API_BASE_URL = (
  process.env.POSTDEPLOY_API_BASE_URL ||
  process.env.VITE_API_URL ||
  ""
).replace(/\/+$/, "");

const EDGE_BASE_URL = (
  process.env.POSTDEPLOY_EDGE_BASE_URL ||
  process.env.VITE_SUPABASE_EDGE_URL ||
  (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/functions/v1` : "")
).replace(/\/+$/, "");

const EDGE_JWT =
  process.env.POSTDEPLOY_SUPABASE_JWT ||
  process.env.SUPABASE_TEST_JWT ||
  "";

const CHECKOUT_VENUE_ID = process.env.POSTDEPLOY_CHECKOUT_VENUE_ID || "";
const CHECKOUT_SKU = process.env.POSTDEPLOY_CHECKOUT_SKU || "verified_badge";
const CHECKOUT_VISITOR_ID =
  process.env.POSTDEPLOY_CHECKOUT_VISITOR_ID || "postdeploy-healthcheck";
const CHECKOUT_RETURN_URL =
  process.env.POSTDEPLOY_CHECKOUT_RETURN_URL || "https://vibecity.live";
const ORDER_ID = process.env.POSTDEPLOY_ORDER_ID || "";
const READ_ONLY = process.env.POSTDEPLOY_READ_ONLY === "1";

const MAX_RETRIES = parsePositiveInt("POSTDEPLOY_MAX_RETRIES", 8);
const RETRY_DELAY_MS = parsePositiveInt("POSTDEPLOY_RETRY_DELAY_MS", 5000);
const FETCH_TIMEOUT_MS = parsePositiveInt("POSTDEPLOY_FETCH_TIMEOUT_MS", 10000);
const REPORT_PATH = process.env.POSTDEPLOY_REPORT_PATH || "";

if (!API_BASE_URL) {
  console.error("Missing POSTDEPLOY_API_BASE_URL (or VITE_API_URL)");
  process.exit(1);
}

if (/[<>]/.test(API_BASE_URL)) {
  console.error(
    `POSTDEPLOY_API_BASE_URL contains placeholder characters: ${API_BASE_URL}`,
  );
  process.exit(1);
}

if (EDGE_BASE_URL && /[<>]/.test(EDGE_BASE_URL)) {
  console.error(
    `POSTDEPLOY_EDGE_BASE_URL contains placeholder characters: ${EDGE_BASE_URL}`,
  );
  process.exit(1);
}

const allowedRouteStatuses = new Set([200, 400, 401, 403, 422]);
const allowedReadOnlyRouteStatuses = new Set([200, 401, 403, 405]);
const routeResults = [];
const startedAt = new Date().toISOString();

class HealthcheckError extends Error {
  constructor(category, message) {
    super(message);
    this.category = category;
  }
}

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  if (idx === -1) return ".";
  return path.slice(0, idx) || ".";
}

function pushRouteResult({
  phase,
  name,
  method,
  url,
  status,
  latencyMs = null,
  readOnly = false,
  required = true,
  ok = true,
  errorCategory = null,
  errorMessage = "",
}) {
  routeResults.push({
    phase,
    name,
    method,
    url,
    status,
    latency_ms: latencyMs,
    read_only: readOnly,
    required,
    ok,
    error_category: errorCategory,
    error_message: errorMessage,
  });
}

async function callRoute({
  phase,
  name,
  method,
  url,
  headers,
  body,
  readOnly = false,
  required = true,
  acceptOkOnly = false,
}) {
  let response;
  let recorded = false;
  try {
    response = await callJson(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (acceptOkOnly && !response.ok) {
      const err = new HealthcheckError(
        "unexpected-status",
        `${name} failed with status ${response.status}`,
      );
      pushRouteResult({
        phase,
        name,
        method,
        url,
        status: response.status,
        latencyMs: response.durationMs ?? null,
        readOnly,
        required,
        ok: false,
        errorCategory: err.category,
        errorMessage: err.message,
      });
      recorded = true;
      throw err;
    }

    if (required) {
      ensureRouteExists(name, response.status, { readOnly });
    }

    pushRouteResult({
      phase,
      name,
      method,
      url,
      status: response.status,
      latencyMs: response.durationMs ?? null,
      readOnly,
      required,
      ok: true,
    });
    recorded = true;
    return response;
  } catch (err) {
    if (!response) {
      pushRouteResult({
        phase,
        name,
        method,
        url,
        status: null,
        latencyMs: null,
        readOnly,
        required,
        ok: false,
        errorCategory: err instanceof HealthcheckError ? err.category : "network",
        errorMessage: err?.message || String(err),
      });
      recorded = true;
    } else if (required && !recorded) {
      pushRouteResult({
        phase,
        name,
        method,
        url,
        status: response.status,
        latencyMs: response.durationMs ?? null,
        readOnly,
        required,
        ok: false,
        errorCategory: err instanceof HealthcheckError ? err.category : "unexpected-status",
        errorMessage: err?.message || String(err),
      });
      recorded = true;
    }
    throw err;
  }
}

async function writeReport(finalStatus, finalCategory = "pass", finalError = "") {
  if (!REPORT_PATH) {
    return;
  }
  const payload = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    status: finalStatus,
    failure_category: finalCategory,
    failure_message: finalError,
    api_base_url: API_BASE_URL,
    edge_base_url: EDGE_BASE_URL || null,
    read_only: READ_ONLY,
    retry: {
      max_retries: MAX_RETRIES,
      retry_delay_ms: RETRY_DELAY_MS,
      fetch_timeout_ms: FETCH_TIMEOUT_MS,
    },
    route_checks: routeResults,
  };
  await mkdir(getParentDir(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(payload, null, 2));
}

async function callJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const durationMs = Date.now() - started;
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      status: res.status,
      ok: res.ok,
      text,
      json,
      durationMs,
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new HealthcheckError(
        "network",
        `request timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`,
      );
    }
    throw new HealthcheckError(
      "network",
      `network error for ${url}: ${err?.message || err}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function ensureRouteExists(name, status, options = {}) {
  const readOnly = options.readOnly === true;
  if (status === 404) {
    throw new HealthcheckError("route-missing", `${name}: route not found (404)`);
  }
  const allowed = readOnly ? allowedReadOnlyRouteStatuses : allowedRouteStatuses;
  if (!allowed.has(status)) {
    throw new HealthcheckError(
      "unexpected-status",
      `${name}: unexpected status ${status}`,
    );
  }
}

function isRetryableError(err) {
  return (
    err instanceof HealthcheckError &&
    (err.category === "network" ||
      err.category === "route-missing" ||
      err.category === "unexpected-status")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(label, fn) {
  let attempt = 1;
  while (attempt <= MAX_RETRIES) {
    try {
      await fn();
      if (attempt > 1) {
        console.log(`[ok] ${label} recovered on attempt ${attempt}/${MAX_RETRIES}`);
      }
      return;
    } catch (err) {
      const category =
        err instanceof HealthcheckError ? err.category : "unknown";
      const retryable = isRetryableError(err) && attempt < MAX_RETRIES;

      console.error(
        `[warn] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${category}): ${err.message || err}`,
      );

      if (!retryable) {
        throw err;
      }

      const delay = RETRY_DELAY_MS * attempt;
      console.log(`[retry] ${label} waiting ${delay}ms before next attempt`);
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function runApiChecks() {
  console.log(`API base: ${API_BASE_URL}`);
  if (READ_ONLY) {
    console.log("API mode: read-only");
  }

  const health = await callRoute({
    phase: "api",
    name: "GET /health",
    method: "GET",
    url: `${API_BASE_URL}/health`,
    acceptOkOnly: true,
  });
  console.log(`[ok] GET /health -> ${health.status}`);

  if (READ_ONLY) {
    const checkoutReadOnly = await callRoute({
      phase: "api",
      name: "GET /api/v1/payments/create-checkout-session (read-only)",
      method: "GET",
      url: `${API_BASE_URL}/api/v1/payments/create-checkout-session`,
      readOnly: true,
    });
    console.log(
      `[ok] GET /api/v1/payments/create-checkout-session (read-only) -> ${checkoutReadOnly.status}`,
    );

    const manualOrderReadOnly = await callRoute({
      phase: "api",
      name: "GET /api/v1/payments/manual-order (read-only)",
      method: "GET",
      url: `${API_BASE_URL}/api/v1/payments/manual-order`,
      readOnly: true,
    });
    console.log(
      `[ok] GET /api/v1/payments/manual-order (read-only) -> ${manualOrderReadOnly.status}`,
    );
    return;
  }

  const checkout = await callRoute({
    phase: "api",
    name: "POST /api/v1/payments/create-checkout-session",
    method: "POST",
    url: `${API_BASE_URL}/api/v1/payments/create-checkout-session`,
    headers: { "Content-Type": "application/json" },
    body: {
      itemType: "verified",
      itemId: "healthcheck",
      successUrl: CHECKOUT_RETURN_URL,
      cancelUrl: CHECKOUT_RETURN_URL,
    },
  });
  console.log(
    `[ok] POST /api/v1/payments/create-checkout-session -> ${checkout.status}`,
  );

  const manualOrder = await callRoute({
    phase: "api",
    name: "POST /api/v1/payments/manual-order",
    method: "POST",
    url: `${API_BASE_URL}/api/v1/payments/manual-order`,
    headers: { "Content-Type": "application/json" },
    body: {},
  });
  console.log(`[ok] POST /api/v1/payments/manual-order -> ${manualOrder.status}`);
}

async function runEdgeChecks() {
  if (!EDGE_BASE_URL) {
    console.log("[skip] Edge checks: no EDGE base URL configured");
    pushRouteResult({
      phase: "edge",
      name: "EDGE checks",
      method: "SKIP",
      url: EDGE_BASE_URL || "",
      status: null,
      required: false,
      ok: true,
      errorMessage: "No EDGE base URL configured",
    });
    return;
  }

  if (!EDGE_JWT) {
    console.log("[skip] Edge checks: no POSTDEPLOY_SUPABASE_JWT provided");
    pushRouteResult({
      phase: "edge",
      name: "EDGE checks",
      method: "SKIP",
      url: EDGE_BASE_URL || "",
      status: null,
      required: false,
      ok: true,
      errorMessage: "No POSTDEPLOY_SUPABASE_JWT provided",
    });
    return;
  }

  console.log(`Edge base: ${EDGE_BASE_URL}`);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${EDGE_JWT}`,
  };

  if (READ_ONLY) {
    const edgeCheckoutReadOnly = await callRoute({
      phase: "edge",
      name: "GET /functions/v1/create-checkout-session (read-only)",
      method: "GET",
      url: `${EDGE_BASE_URL}/create-checkout-session`,
      headers,
      readOnly: true,
    });
    console.log(
      `[ok] GET /functions/v1/create-checkout-session (read-only) -> ${edgeCheckoutReadOnly.status}`,
    );

    if (!ORDER_ID) {
      console.log("[skip] Edge get-order-status read-only: no POSTDEPLOY_ORDER_ID provided");
      pushRouteResult({
        phase: "edge",
        name: "GET /functions/v1/get-order-status (read-only)",
        method: "GET",
        url: `${EDGE_BASE_URL}/get-order-status`,
        status: null,
        readOnly: true,
        required: false,
        ok: true,
        errorMessage: "Skipped: no POSTDEPLOY_ORDER_ID provided",
      });
      return;
    }

    const edgeOrderReadOnly = await callRoute({
      phase: "edge",
      name: "GET /functions/v1/get-order-status (read-only)",
      method: "GET",
      url: `${EDGE_BASE_URL}/get-order-status`,
      headers,
      readOnly: true,
    });
    console.log(
      `[ok] GET /functions/v1/get-order-status (read-only) -> ${edgeOrderReadOnly.status}`,
    );
    return;
  }

  const checkoutPayload = {
    venue_id: CHECKOUT_VENUE_ID || "00000000-0000-0000-0000-000000000000",
    sku: CHECKOUT_SKU,
    visitor_id: CHECKOUT_VISITOR_ID,
    returnUrl: CHECKOUT_RETURN_URL,
  };

  const edgeCheckout = await callRoute({
    phase: "edge",
    name: "POST /functions/v1/create-checkout-session",
    method: "POST",
    url: `${EDGE_BASE_URL}/create-checkout-session`,
    headers,
    body: checkoutPayload,
  });
  console.log(
    `[ok] POST /functions/v1/create-checkout-session -> ${edgeCheckout.status}`,
  );

  if (!ORDER_ID) {
    console.log("[skip] Edge get-order-status: no POSTDEPLOY_ORDER_ID provided");
    pushRouteResult({
      phase: "edge",
      name: "POST /functions/v1/get-order-status",
      method: "POST",
      url: `${EDGE_BASE_URL}/get-order-status`,
      status: null,
      required: false,
      ok: true,
      errorMessage: "Skipped: no POSTDEPLOY_ORDER_ID provided",
    });
    return;
  }

  const orderStatus = await callRoute({
    phase: "edge",
    name: "POST /functions/v1/get-order-status",
    method: "POST",
    url: `${EDGE_BASE_URL}/get-order-status`,
    headers,
    body: { orderId: ORDER_ID },
  });
  console.log(`[ok] POST /functions/v1/get-order-status -> ${orderStatus.status}`);
}

async function main() {
  await withRetries("api-checks", runApiChecks);
  await withRetries("edge-checks", runEdgeChecks);
  await writeReport("pass", "pass", "");
  console.log("Post-deploy healthcheck passed");
}

main().catch(async (err) => {
  const category = err instanceof HealthcheckError ? err.category : "unknown";
  await writeReport("fail", category, err.message || String(err));
  console.error("Post-deploy healthcheck failed");
  console.error(`Failure category: ${category}`);
  console.error(err.message || err);
  process.exit(1);
});
