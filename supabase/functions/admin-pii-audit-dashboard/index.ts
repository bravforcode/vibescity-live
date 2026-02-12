import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const asDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toIso = (d: Date) => d.toISOString();
const toDay = (d: Date) => d.toISOString().slice(0, 10);

const collectRoles = (user: { app_metadata?: Record<string, unknown> }) => {
  const roles = new Set<string>();
  const meta = user?.app_metadata || {};
  const role = meta.role;
  const roleArray = Array.isArray(meta.roles) ? meta.roles : [];

  if (typeof role === "string" && role.trim()) roles.add(role.trim());
  for (const r of roleArray) {
    if (typeof r === "string" && r.trim()) roles.add(r.trim());
  }
  return roles;
};

const canViewPiiAudit = (user: { app_metadata?: Record<string, unknown> }) => {
  const roles = collectRoles(user);
  return roles.has("admin") || roles.has("pii_audit_viewer");
};

type SupabaseClient = ReturnType<typeof createClient>;

const countSessions = async (
  adminClient: SupabaseClient,
  timeColumn: string,
  fromIso: string,
  toIso: string,
  country?: string,
) => {
  let query = adminClient
    .from("pii_audit_sessions")
    .select("id", { count: "exact", head: true })
    .gte(timeColumn, fromIso)
    .lt(timeColumn, toIso);

  if (country) query = query.eq("country", country);

  const { error, count } = await query;
  if (error) throw error;
  return count || 0;
};

const collectSessionAgg = async (
  adminClient: SupabaseClient,
  timeColumn: string,
  fromIso: string,
  toIso: string,
  country?: string,
  maxRows = 50000,
) => {
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);

  const uniqueVisitors = new Set<string>();
  const uniqueVisitorsByDay = new Map<string, Set<string>>();
  const sessionsByDay = new Map<string, number>();
  const countryCounts = new Map<string, { sessions: number; visitors: Set<string> }>();

  let fetched = 0;
  let truncated = false;

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    let q = adminClient
      .from("pii_audit_sessions")
      .select(`visitor_id,country,${timeColumn}`)
      .gte(timeColumn, fromIso)
      .lt(timeColumn, toIso)
      .order(timeColumn, { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (country) q = q.eq("country", country);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (!rows.length) break;

    for (const row of rows) {
      const visitorId = typeof row.visitor_id === "string" ? row.visitor_id : "";
      const countryCode = typeof row.country === "string" ? row.country : "";
      const ts = row[timeColumn];
      const day =
        typeof ts === "string" && ts.length >= 10 ? ts.slice(0, 10) : "";

      fetched += 1;
      if (visitorId) {
        uniqueVisitors.add(visitorId);
        if (day) {
          const set = uniqueVisitorsByDay.get(day) || new Set<string>();
          set.add(visitorId);
          uniqueVisitorsByDay.set(day, set);
        }
      }

      if (day) {
        sessionsByDay.set(day, (sessionsByDay.get(day) || 0) + 1);
      }

      const bucket = countryCounts.get(countryCode) || {
        sessions: 0,
        visitors: new Set<string>(),
      };
      bucket.sessions += 1;
      if (visitorId) bucket.visitors.add(visitorId);
      countryCounts.set(countryCode, bucket);
    }

    if (rows.length < pageSize) break;
    if (fetched >= maxRows) {
      truncated = true;
      break;
    }
  }

  const days = Array.from(sessionsByDay.keys()).sort();
  const sessionsByDayOut = days.map((day) => ({
    day,
    sessions: sessionsByDay.get(day) || 0,
    unique_visitors: uniqueVisitorsByDay.get(day)?.size || 0,
  }));

  const topCountriesOut = Array.from(countryCounts.entries())
    .map(([countryCode, bucket]) => ({
      country: countryCode || null,
      sessions: bucket.sessions,
      unique_visitors: bucket.visitors.size,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  return {
    fetched,
    truncated,
    unique_visitors_total: uniqueVisitors.size,
    sessions_by_day: sessionsByDayOut,
    top_countries: topCountriesOut,
  };
};

const fetchRecentSessions = async (
  adminClient: SupabaseClient,
  timeColumn: string,
  fromIso: string,
  toIso: string,
  country?: string,
  limit = 100,
) => {
  let q = adminClient
    .from("pii_audit_sessions")
    .select("visitor_id,user_id,ip_raw,user_agent,country,city,started_at,last_seen_at,created_at")
    .gte(timeColumn, fromIso)
    .lt(timeColumn, toIso)
    .order(timeColumn, { ascending: false })
    .limit(limit);
  if (country) q = q.eq("country", country);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
};

const countLiveVisitors15m = async (
  adminClient: SupabaseClient,
  country?: string,
) => {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let q = adminClient
    .from("pii_audit_sessions")
    .select("visitor_id")
    .gt("last_seen_at", since)
    .limit(50000);
  if (country) q = q.eq("country", country);
  const { data, error } = await q;
  if (error) throw error;
  const set = new Set<string>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const vid = typeof row.visitor_id === "string" ? row.visitor_id : "";
    if (vid) set.add(vid);
  }
  return set.size;
};

const fetchAccessLogsPaged = async (
  adminClient: SupabaseClient,
  fromIso: string,
  toIso: string,
  maxRows = 10000,
) => {
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);
  const out: Array<Record<string, unknown>> = [];

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    const { data, error } = await adminClient
      .from("pii_audit_access_log")
      .select("actor_user_id,action,created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize || out.length >= maxRows) break;
  }

  return out.slice(0, maxRows);
};

const buildAccessReport = async (
  adminClient: SupabaseClient,
  fromIso: string,
  toIso: string,
) => {
  const maxRows = clamp(
    Number(Deno.env.get("PII_AUDIT_ACCESS_MAX_ROWS") || "10000") || 10000,
    1000,
    100000,
  );

  const rows = await fetchAccessLogsPaged(adminClient, fromIso, toIso, maxRows);
  const totals = { views: 0, exports: 0, actions: 0 };
  const byActor = new Map<
    string,
    { views: number; exports: number; actions: number; last_seen_at: string }
  >();

  for (const row of rows) {
    const actor = typeof row.actor_user_id === "string" ? row.actor_user_id : "";
    const action = typeof row.action === "string" ? row.action : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";

    totals.actions += 1;
    if (action === "view") totals.views += 1;
    if (action === "export") totals.exports += 1;

    if (!actor) continue;
    const current = byActor.get(actor) || {
      views: 0,
      exports: 0,
      actions: 0,
      last_seen_at: createdAt,
    };
    if (action === "view") current.views += 1;
    if (action === "export") current.exports += 1;
    current.actions += 1;
    if (createdAt && (!current.last_seen_at || createdAt > current.last_seen_at)) {
      current.last_seen_at = createdAt;
    }
    byActor.set(actor, current);
  }

  const topActors = Array.from(byActor.entries())
    .map(([actor_user_id, stats]) => ({ actor_user_id, ...stats }))
    .sort((a, b) => b.actions - a.actions)
    .slice(0, 20);

  // Best-effort email resolution (service role)
  const emailByUserId = new Map<string, string>();
  for (const item of topActors) {
    const id = item.actor_user_id;
    if (!id) continue;
    try {
      const { data } = await adminClient.auth.admin.getUserById(id);
      const email = data?.user?.email;
      if (email) emailByUserId.set(id, email);
    } catch {
      // ignore
    }
  }

  return {
    totals,
    top_viewers: topActors.map((row) => ({
      ...row,
      email: emailByUserId.get(row.actor_user_id) || null,
    })),
    rows_fetched: rows.length,
    truncated: rows.length >= maxRows,
    max_rows: maxRows,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const expectedPin = Deno.env.get("PII_AUDIT_ADMIN_PIN") || "";

    if (!expectedPin) {
      return new Response(JSON.stringify({ error: "PII audit not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!canViewPiiAudit(user)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!pin || pin !== expectedPin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const days = clamp(Number(body.days) || 7, 1, 31);
    const from = asDate(body.from);
    const to = asDate(body.to);
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const recentLimit = clamp(Number(body.recent_limit) || 100, 0, 200);

    const now = new Date();
    const rangeTo = to || now;
    const rangeFrom = from || new Date(rangeTo.getTime() - days * 24 * 60 * 60 * 1000);

    const rangeDays =
      (rangeTo.getTime() - rangeFrom.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(rangeDays) || rangeDays <= 0 || rangeDays > 31) {
      return new Response(JSON.stringify({ error: "Invalid range (max 31 days)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const fromIso = toIso(rangeFrom);
    const toIsoValue = toIso(rangeTo);

    const maxRows = clamp(
      Number(Deno.env.get("PII_AUDIT_DASHBOARD_MAX_ROWS") || "50000") || 50000,
      1000,
      250000,
    );

    const sessionsTotal = await countSessions(
      adminClient,
      "last_seen_at",
      fromIso,
      toIsoValue,
      country || undefined,
    );
    const agg = await collectSessionAgg(
      adminClient,
      "last_seen_at",
      fromIso,
      toIsoValue,
      country || undefined,
      maxRows,
    );
    const liveVisitors15m = await countLiveVisitors15m(
      adminClient,
      country || undefined,
    );
    const recentSessions = await fetchRecentSessions(
      adminClient,
      "last_seen_at",
      fromIso,
      toIsoValue,
      country || undefined,
      recentLimit,
    );

    const accessReport = await buildAccessReport(adminClient, fromIso, toIsoValue);

    // Audit access (do not store PIN)
    const filters = {
      from: fromIso,
      to: toIsoValue,
      country: country || null,
      recent_limit: recentLimit,
    };
    await adminClient
      .from("pii_audit_access_log")
      .insert({ actor_user_id: user.id, action: "view", filters })
      .catch(() => {});

    return new Response(
      JSON.stringify({
        request_id: requestId,
        range: {
          from: toDay(rangeFrom),
          to: toDay(rangeTo),
          days,
          sessions_time_column: "last_seen_at",
          max_rows: maxRows,
          truncated: agg.truncated,
        },
        kpis: {
          sessions_total: sessionsTotal,
          unique_visitors_total: agg.unique_visitors_total,
          live_visitors_15m: liveVisitors15m,
        },
        sessions_by_day: agg.sessions_by_day,
        top_countries: agg.top_countries,
        recent_sessions: recentSessions,
        access_report: accessReport,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.warn("[admin-pii-audit-dashboard]", requestId, "error", error?.message || error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
