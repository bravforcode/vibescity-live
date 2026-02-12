import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const parseAllowlist = (raw: string | undefined | null) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => trimTrailingSlash(origin.toLowerCase()));

const ORIGIN_ALLOWLIST = parseAllowlist(Deno.env.get("ANALYTICS_ORIGIN_ALLOWLIST"));

const toBool = (raw: string | undefined | null, fallback = false) => {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
};

// Production safety: by default, require an explicit allowlist.
// Set ANALYTICS_ORIGIN_ALLOWLIST_REQUIRED=false only for local/dev.
const ORIGIN_ALLOWLIST_REQUIRED = toBool(
  Deno.env.get("ANALYTICS_ORIGIN_ALLOWLIST_REQUIRED"),
  true,
);
const ORIGIN_ENFORCED = ORIGIN_ALLOWLIST_REQUIRED || ORIGIN_ALLOWLIST.length > 0;

const parseCsvList = (raw: string | undefined | null) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const EVENT_ALLOWLIST = parseCsvList(Deno.env.get("ANALYTICS_EVENT_ALLOWLIST")).map(
  (s) => s.toLowerCase(),
);

const DEFAULT_CORS_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const isUuidLike = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value.trim());

const isAllowedOrigin = (origin: string) => {
  const o = trimTrailingSlash(origin.toLowerCase());
  if (!o) return false;
  if (!ORIGIN_ALLOWLIST.length) return !ORIGIN_ALLOWLIST_REQUIRED;

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

const withCors = (origin: string | null) => {
  // When origin enforcement is enabled, echo the requesting origin (no wildcard).
  if (ORIGIN_ENFORCED) {
    return {
      ...DEFAULT_CORS_HEADERS,
      "Access-Control-Allow-Origin": origin || "null",
      Vary: "Origin",
    };
  }

  // Dev/default: allow all.
  return { ...DEFAULT_CORS_HEADERS, "Access-Control-Allow-Origin": "*" };
};

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const sha256Hex = async (input: string) => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
};

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

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("origin");
  const corsHeaders = withCors(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    if (ORIGIN_ENFORCED && (!origin || !isAllowedOrigin(origin))) {
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

  if (ORIGIN_ENFORCED && (!origin || !isAllowedOrigin(origin))) {
    return new Response(JSON.stringify({ error: "Forbidden origin" }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }

  try {
    // 1. Init Supabase (Service Role needed for analytics insert)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 2. Parse Body & Headers
    const body = await safeJson(req);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    const event_type = typeof body.event_type === "string" ? body.event_type.trim() : "";
    const visitor_id = typeof body.visitor_id === "string" ? body.visitor_id.trim() : "";
    const shop_id = body.shop_id;
    const venue_ref = body.venue_ref;
    const metadata = body.metadata;

    // Basic validation (anti-spam + schema safety)
    if (!event_type || event_type.length > 48 || !/^[a-zA-Z0-9:_-]+$/.test(event_type)) {
      return new Response(JSON.stringify({ error: "Invalid event_type" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    if (EVENT_ALLOWLIST.length && !EVENT_ALLOWLIST.includes(event_type.toLowerCase())) {
      return new Response(JSON.stringify({ error: "event_type not allowed" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    if (event_type.toLowerCase() !== "web_vital" && (!visitor_id || visitor_id.length > 128)) {
      return new Response(JSON.stringify({ error: "Invalid visitor_id" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    const safeMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata
        : {};
    const metadataMaxBytes = Math.min(
      Math.max(Number(Deno.env.get("ANALYTICS_METADATA_MAX_BYTES") || "4096") || 4096, 256),
      32768,
    );
    const metadataBytes = new TextEncoder().encode(JSON.stringify(safeMetadata)).length;
    if (metadataBytes > metadataMaxBytes) {
      return new Response(JSON.stringify({ error: "metadata too large" }), {
        status: 413,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    // Performance telemetry path (no PII): do not resolve/create session, user, or ip hash.
    if (event_type.toLowerCase() === "web_vital") {
      const metricName = String(safeMetadata?.metric_name || "").toUpperCase();
      const metricValue = Number(safeMetadata?.value);
      const allowedMetrics = new Set(["LCP", "INP", "CLS"]);
      if (!allowedMetrics.has(metricName) || !Number.isFinite(metricValue)) {
        return new Response(JSON.stringify({ error: "Invalid web_vital metadata" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
        });
      }

      const normalizedMetadata = {
        metric_name: metricName,
        value: metricValue,
        path_template: String(safeMetadata?.path_template || "/"),
        device_form_factor: String(safeMetadata?.device_form_factor || "unknown"),
        connection_type: String(safeMetadata?.connection_type || "unknown"),
      };

      const { error: partitionError } = await supabase.from("analytics_events_p").insert({
        session_id: null,
        event_type: "web_vital",
        shop_id: null,
        venue_ref: null,
        metadata: normalizedMetadata,
        visitor_id: null,
      });
      if (partitionError) {
        console.warn(
          "[analytics-ingest]",
          requestId,
          "analytics_events_p insert failed:",
          partitionError.message,
        );
      }

      const { error: legacyError } = await supabase.from("analytics_events").insert({
        session_id: null,
        event_type: "web_vital",
        metadata: normalizedMetadata,
      });
      if (legacyError) {
        console.warn(
          "[analytics-ingest]",
          requestId,
          "analytics_events insert failed:",
          legacyError.message,
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
        },
      });
    }

    const normalizedVenueRefRaw = String(
      (typeof venue_ref === "string" && venue_ref.trim()) ||
        (typeof safeMetadata?.venue_ref === "string" && safeMetadata.venue_ref.trim()) ||
        (typeof safeMetadata?.shop_id === "string" && safeMetadata.shop_id.trim()) ||
        (typeof shop_id === "string" && shop_id.trim()) ||
        (Number.isFinite(Number(shop_id)) ? String(shop_id) : ""),
    ).trim();
    const normalizedVenueRef = normalizedVenueRefRaw ? normalizedVenueRefRaw : null;

    const shopIdUuid = isUuidLike(shop_id)
      ? String(shop_id).trim()
      : isUuidLike(normalizedVenueRef)
        ? String(normalizedVenueRef).trim()
        : null;
    const shopIdNumeric = Number.isFinite(Number(shop_id)) ? Number(shop_id) : null;

    const userAgent = req.headers.get("user-agent") || "unknown";
    const clientIp = pickClientIp(req);
    const ipSalt = Deno.env.get("ANALYTICS_IP_HASH_SALT") || "";
    const ipHash =
      ipSalt && clientIp ? await sha256Hex(`${ipSalt}:${clientIp}`) : null;
    if (!ipSalt && clientIp) {
      console.warn("[analytics-ingest]", requestId, "missing ANALYTICS_IP_HASH_SALT");
    }

    // 3. Resolve User (if logged in)
    const authHeader = req.headers.get("Authorization");
    let userId = null;
    if (authHeader) {
      const {
        data: { user },
      } = await createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      ).auth.getUser();
      if (user) userId = user.id;
    }

    // 4. Extract Geo Headers (Cloudflare/Supabase standard)
    // Note: Local dev might usually be null, but Prod populates these
    const country =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      null;
    const city =
      req.headers.get("cf-ipcity") ||
      req.headers.get("x-vercel-ip-city") ||
      null;
    const region = req.headers.get("cf-region") || null;

    // 5. Find or Create Session (Upsert logic simplified)
    // We update 'last_seen' if exists, or insert new.

    // Check for existing recent session (last 30 mins)
    let sessionId = null;
    const { data: existingSession } = await supabase
      .from("analytics_sessions")
      .select("id")
      .eq("visitor_id", visitor_id)
      .gt("last_seen_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(1)
      .single();

    if (existingSession) {
      sessionId = existingSession.id;
      // Update last_seen
      await supabase
        .from("analytics_sessions")
        .update({ last_seen_at: new Date() })
        .eq("id", sessionId);
    } else {
      // Create new
      const { data: newSession, error: sessionError } = await supabase
        .from("analytics_sessions")
        .insert({
          visitor_id,
          user_id: userId,
          user_agent: userAgent,
          ip_hash: ipHash,
          country,
          city,
          referrer: safeMetadata?.referrer,
          device_type: userAgent.toLowerCase().includes("mobile")
            ? "mobile"
            : "desktop", // Simple detection
        })
        .select("id")
        .single();

      if (sessionError) throw sessionError;
      sessionId = newSession.id;
    }

    // 6. Insert Partitioned Raw Event (preferred)
    const { error: partitionError } = await supabase
      .from("analytics_events_p")
      .insert({
        session_id: sessionId,
        event_type,
        shop_id: shopIdUuid,
        venue_ref: normalizedVenueRef,
        metadata: {
          ...safeMetadata,
          venue_ref: normalizedVenueRef,
          shop_id: shopIdUuid ?? shopIdNumeric ?? shop_id ?? null,
          visitor_id,
        },
        visitor_id: visitor_id ?? null,
      });

    if (partitionError) {
      console.warn(
        "[analytics-ingest]",
        requestId,
        "analytics_events_p insert failed:",
        partitionError.message,
      );
    }

    // 7. Legacy compatibility write (for existing dashboards/RPC)
    const legacyBase = {
      session_id: sessionId,
      event_type,
      metadata: {
        ...safeMetadata,
        venue_ref: normalizedVenueRef,
        shop_id: shopIdUuid ?? shopIdNumeric ?? shop_id ?? null,
        visitor_id,
      },
    } as Record<string, unknown>;

    const tryLegacyInsert = async (row: Record<string, unknown>) =>
      await supabase.from("analytics_events").insert(row);

    // The legacy table has schema drift across environments (shop_id can be BIGINT or UUID).
    // Try best-effort insert and fail open (analytics must not break the app).
    let legacyError: { message?: string } | null = null;
    if (shopIdUuid) {
      const { error } = await tryLegacyInsert({ ...legacyBase, shop_id: shopIdUuid });
      legacyError = error || null;
    } else if (shopIdNumeric !== null) {
      const { error } = await tryLegacyInsert({ ...legacyBase, shop_id: shopIdNumeric });
      legacyError = error || null;
    } else {
      const { error } = await tryLegacyInsert(legacyBase);
      legacyError = error || null;
    }

    if (legacyError) {
      // Retry once without shop_id column (still keeping venue_ref in metadata).
      const { error: retryError } = await tryLegacyInsert(legacyBase);
      if (retryError) {
        console.warn(
          "[analytics-ingest]",
          requestId,
          "analytics_events insert failed:",
          retryError.message,
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    console.warn("[analytics-ingest]", requestId, "error", error?.message || error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }
});
