#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "https://vibecity.live").replace(
  /\/+$/,
  "",
);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PAGE_SIZE = Math.max(Number(process.env.SEO_CACHE_PAGE_SIZE || 1000), 100);
const MAX_VENUES = Math.max(Number(process.env.SEO_CACHE_MAX_VENUES || 10000), 1);
const CONCURRENCY = Math.max(Number(process.env.SEO_CACHE_CONCURRENCY || 8), 1);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for SEO cache warm job.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const fetchVenueRefs = async () => {
  const rows = [];
  for (let from = 0; from < MAX_VENUES; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_VENUES - 1);
    const { data, error } = await supabase
      .from("venues_public")
      .select("slug,short_code")
      .not("slug", "is", null)
      .range(from, to);
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
};

const toUrls = (rows) => {
  const urls = new Set();
  for (const row of rows) {
    const slug = String(row?.slug || "").trim();
    if (!slug) continue;
    urls.add(`${SITE_ORIGIN}/th/v/${encodeURIComponent(slug)}`);
    urls.add(`${SITE_ORIGIN}/en/v/${encodeURIComponent(slug)}`);
    const code = String(row?.short_code || "").trim().toUpperCase();
    if (/^[A-Z2-7]{7}$/.test(code)) {
      urls.add(`${SITE_ORIGIN}/r/${code}`);
    }
  }
  return [...urls];
};

const warmUrl = async (url) => {
  const headers = { "User-Agent": "VibeCityCacheWarm/1.0" };
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", headers });
    if (head.ok) return { ok: true, url, status: head.status };
  } catch {
    // Fall back to GET to warm CDN where HEAD is blocked.
  }

  try {
    const get = await fetch(url, { method: "GET", redirect: "follow", headers });
    return { ok: get.ok, url, status: get.status };
  } catch (error) {
    return { ok: false, url, status: 0, error: String(error) };
  }
};

const runPool = async (urls) => {
  const results = [];
  let idx = 0;

  const worker = async () => {
    while (idx < urls.length) {
      const current = idx++;
      const result = await warmUrl(urls[current]);
      results.push(result);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
};

const main = async () => {
  const startedAt = new Date().toISOString();
  const rows = await fetchVenueRefs();
  const urls = toUrls(rows);
  const results = await runPool(urls);

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    siteOrigin: SITE_ORIGIN,
    venues: rows.length,
    urls: urls.length,
    ok,
    failed: failed.length,
    failures: failed.slice(0, 100),
  };

  console.log(JSON.stringify(payload, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("SEO cache warm failed:", error);
  process.exit(1);
});

