import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const parseAllowlist = (raw: string | undefined | null) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => trimTrailingSlash(origin.toLowerCase()));

const ORIGIN_ALLOWLIST = parseAllowlist(Deno.env.get("PII_AUDIT_ORIGIN_ALLOWLIST"));

const DEFAULT_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const isAllowedOrigin = (origin: string) => {
  const o = trimTrailingSlash(origin.toLowerCase());
  if (!o) return false;
  if (!ORIGIN_ALLOWLIST.length) return false; // default deny when not configured

  try {
    const url = new URL(o);
    const hostname = url.hostname.toLowerCase();

    return ORIGIN_ALLOWLIST.some((entry) => {
      if (entry.startsWith("*.")) {
        const suffix = entry.slice(2);
        return hostname === suffix || hostname.endsWith(`.${suffix}`);
      }
      return entry === o;
    });
  } catch {
    return false;
  }
};

const withCors = (origin: string | null) => ({
  ...DEFAULT_CORS_HEADERS,
  // PII ingest should never return wildcard in prod; echo the requesting origin.
  "Access-Control-Allow-Origin": origin || "null",
  Vary: "Origin",
});

const pickClientIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const vercel = req.headers.get("x-real-ip")?.trim();
  if (vercel) return vercel;
  return null;
};

const safeJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

const toBool = (raw: string | undefined | null, fallback = false) => {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("origin");
  const corsHeaders = withCors(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    if (!origin || !isAllowedOrigin(origin)) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }

  // Hard safety: PII ingest requires an explicit allowlist.
  if (!origin || !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }

  const enabled = toBool(Deno.env.get("PII_AUDIT_ENABLED"), false);
  if (!enabled) {
    // Fail closed: do nothing unless explicitly enabled.
    return new Response(JSON.stringify({ success: true, disabled: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await safeJson(req);
    const visitorIdFromHeader = req.headers.get("vibe_visitor_id") || "";
    const visitor_id =
      typeof body?.visitor_id === "string"
        ? body.visitor_id.trim()
        : visitorIdFromHeader.trim();

    if (!visitor_id || visitor_id.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid visitor_id" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;
    if (authHeader) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (user?.id) userId = user.id;
    }

    const userAgent = req.headers.get("user-agent") || "unknown";
    const clientIp = pickClientIp(req);

    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      null;
    const city =
      req.headers.get("cf-ipcity") ||
      req.headers.get("x-vercel-ip-city") ||
      null;

    const windowMinutesRaw = Number(Deno.env.get("PII_AUDIT_SESSION_WINDOW_MINUTES") || "30");
    const windowMinutes =
      Number.isFinite(windowMinutesRaw) && windowMinutesRaw > 0 && windowMinutesRaw <= 180
        ? windowMinutesRaw
        : 30;
    const windowIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    // Sessionization: update last_seen for an existing session in the last window, else insert new.
    const { data: existing } = await adminClient
      .from("pii_audit_sessions")
      .select("id")
      .eq("visitor_id", visitor_id)
      .gt("last_seen_at", windowIso)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing?.id) {
      const patch: Record<string, unknown> = {
        last_seen_at: now,
      };
      if (userId) patch.user_id = userId;
      if (clientIp) patch.ip_raw = clientIp;
      if (userAgent) patch.user_agent = userAgent;
      if (country) patch.country = country;
      if (city) patch.city = city;

      await adminClient.from("pii_audit_sessions").update(patch).eq("id", existing.id);
      return new Response(JSON.stringify({ success: true, session_id: existing.id }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    const { data: inserted, error: insertError } = await adminClient
      .from("pii_audit_sessions")
      .insert({
        visitor_id,
        user_id: userId,
        ip_raw: clientIp,
        user_agent: userAgent,
        country,
        city,
        started_at: now,
        last_seen_at: now,
      })
      .select("id")
      .maybeSingle();
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, session_id: inserted?.id || null }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    // Never log raw IPs or request bodies.
    console.warn("[pii-audit-ingest]", requestId, "error", error?.message || error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }
});

