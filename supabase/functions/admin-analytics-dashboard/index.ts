import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const isAdminUser = (user: { app_metadata?: Record<string, unknown> }) => {
  const meta = user?.app_metadata || {};
  const role = meta.role;
  const roles = Array.isArray(meta.roles) ? meta.roles : [];
  return role === "admin" || roles.includes("admin");
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

const isUuidLike = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value.trim());

type SupabaseClient = ReturnType<typeof createClient>;

const pickSessionsTimeColumn = async (
  adminClient: SupabaseClient,
  fromIso: string,
  toIso: string,
) => {
  const columns = ["started_at", "created_at", "last_seen_at"] as const;
  for (const col of columns) {
    const { error } = await adminClient
      .from("analytics_sessions")
      .select("id")
      .gte(col, fromIso)
      .lt(col, toIso)
      .limit(1);
    if (!error) return col;
  }
  return "last_seen_at" as const;
};

const countSessions = async (
  adminClient: SupabaseClient,
  timeColumn: string,
  fromIso: string,
  toIso: string,
  country?: string,
) => {
  let query = adminClient
    .from("analytics_sessions")
    .select("id", { count: "exact", head: true })
    .gte(timeColumn, fromIso)
    .lt(timeColumn, toIso);

  if (country) query = query.eq("country", country);

  const { error, count } = await query;
  if (error) throw error;
  return count || 0;
};

const collectSessions = async (
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
      .from("analytics_sessions")
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
          if (!uniqueVisitorsByDay.has(day)) uniqueVisitorsByDay.set(day, new Set());
          uniqueVisitorsByDay.get(day)!.add(visitorId);
        }
        if (countryCode) {
          if (!countryCounts.has(countryCode)) {
            countryCounts.set(countryCode, { sessions: 0, visitors: new Set() });
          }
          countryCounts.get(countryCode)!.visitors.add(visitorId);
        }
      }

      if (day) {
        sessionsByDay.set(day, (sessionsByDay.get(day) || 0) + 1);
      }
      if (countryCode) {
        if (!countryCounts.has(countryCode)) {
          countryCounts.set(countryCode, { sessions: 0, visitors: new Set() });
        }
        countryCounts.get(countryCode)!.sessions += 1;
      }

      if (fetched >= maxRows) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
    if (rows.length < pageSize) break;
  }

  const sessionsByDayRows = Array.from(sessionsByDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, sessions]) => ({
      day,
      sessions,
      unique_visitors: uniqueVisitorsByDay.get(day)?.size || 0,
    }));

  const topCountries = Array.from(countryCounts.entries())
    .map(([countryCode, agg]) => ({
      country: countryCode,
      sessions: agg.sessions,
      unique_visitors: agg.visitors.size,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  return {
    uniqueVisitors,
    // Used for retention cohorts (kept in-memory; never serialized directly).
    uniqueVisitorsByDayMap: uniqueVisitorsByDay,
    sessionsByDay: sessionsByDayRows,
    topCountries,
    truncated,
    fetched,
  };
};

const collectRecentSessions = async (
  adminClient: SupabaseClient,
  timeColumn: string,
  fromIso: string,
  toIso: string,
  country?: string,
  limit = 50,
) => {
  const safeLimit = clamp(limit, 0, 200);
  if (!safeLimit) return [];

  const trySelect = async (select: string) => {
    let q = adminClient
      .from("analytics_sessions")
      .select(select)
      .gte(timeColumn, fromIso)
      .lt(timeColumn, toIso)
      .order(timeColumn, { ascending: false })
      .limit(safeLimit);
    if (country) q = q.eq("country", country);
    return await q;
  };

  const selects = [
    `visitor_id,user_id,country,city,device_type,user_agent,last_seen_at,${timeColumn}`,
    `visitor_id,user_id,country,city,device_type,last_seen_at,${timeColumn}`,
    `visitor_id,user_id,country,city,last_seen_at,${timeColumn}`,
    `visitor_id,user_id,country,${timeColumn}`,
  ];

  for (const select of selects) {
    const { data, error } = await trySelect(select);
    if (!error) return (data || []) as Array<Record<string, unknown>>;
  }

  return [];
};

const collectLiveVisitors = async (adminClient: SupabaseClient) => {
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await adminClient
    .from("analytics_sessions")
    .select("visitor_id,last_seen_at")
    .gt("last_seen_at", cutoffIso)
    .limit(5000);
  if (error) throw error;
  const unique = new Set<string>();
  (data || []).forEach((row: Record<string, unknown>) => {
    const id = typeof row.visitor_id === "string" ? row.visitor_id : "";
    if (id) unique.add(id);
  });
  return unique.size;
};

const collectEventsFromArchiveDaily = async (
  adminClient: SupabaseClient,
  fromDay: string,
  toDay: string,
  eventType?: string,
  maxRows = 20000,
) => {
  let q = adminClient
    .from("analytics_events_archive_daily")
    .select("day,venue_ref,event_type,events_count,unique_visitors")
    .gte("day", fromDay)
    .lte("day", toDay)
    .order("day", { ascending: true })
    .limit(maxRows);
  if (eventType) q = q.eq("event_type", eventType);
  const { data, error } = await q;
  if (error) return { ok: false as const, error };
  return { ok: true as const, data: (data || []) as Array<Record<string, unknown>> };
};

const collectTopVenuesFromHotspot = async (adminClient: SupabaseClient) => {
  const { data, error } = await adminClient
    .from("hotspot_5m")
    .select("bucket_start,venue_ref,event_count,unique_visitors,score")
    .order("bucket_start", { ascending: false })
    .order("score", { ascending: false })
    .limit(50);
  if (error) return [];
  const rows = (data || []) as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const out: Array<{ venue_ref: string; events: number; unique_visitors: number }> = [];
  for (const row of rows) {
    const ref = typeof row.venue_ref === "string" ? row.venue_ref : "";
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push({
      venue_ref: ref,
      events: Number(row.event_count) || 0,
      unique_visitors: Number(row.unique_visitors) || 0,
    });
    if (out.length >= 20) break;
  }
  return out;
};

const intersectionSize = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const item of small) {
    if (big.has(item)) count += 1;
  }
  return count;
};

const buildRetentionCohorts = (
  uniqueVisitorsByDayMap: Map<string, Set<string>>,
  days: string[],
  {
    horizonDays = 7,
    maxCohorts = 7,
  }: { horizonDays?: number; maxCohorts?: number } = {},
) => {
  const horizon = clamp(horizonDays, 1, 14);
  const cohortLimit = clamp(maxCohorts, 1, 14);

  const sortedDays = [...days].sort();
  const cohortByDay = new Map<string, Set<string>>();
  const seen = new Set<string>();

  for (const day of sortedDays) {
    const set = uniqueVisitorsByDayMap.get(day) || new Set<string>();
    for (const visitor of set) {
      if (seen.has(visitor)) continue;
      seen.add(visitor);
      if (!cohortByDay.has(day)) cohortByDay.set(day, new Set<string>());
      cohortByDay.get(day)!.add(visitor);
    }
  }

  const cohorts: Array<{
    cohort_day: string;
    size: number;
    by_day: Array<{ offset: number; day: string; returning: number; rate: number }>;
  }> = [];

  const startIndex = Math.max(0, sortedDays.length - cohortLimit);
  for (let i = startIndex; i < sortedDays.length; i++) {
    const cohortDay = sortedDays[i];
    const cohortSet = cohortByDay.get(cohortDay) || new Set<string>();
    const size = cohortSet.size;
    if (!size) continue;

    const byDay: Array<{ offset: number; day: string; returning: number; rate: number }> = [];
    for (let offset = 0; offset <= horizon; offset++) {
      const targetDay = sortedDays[i + offset];
      if (!targetDay) break;
      const active = uniqueVisitorsByDayMap.get(targetDay) || new Set<string>();
      const returning = intersectionSize(cohortSet, active);
      byDay.push({
        offset,
        day: targetDay,
        returning,
        rate: size ? returning / size : 0,
      });
    }

    cohorts.push({ cohort_day: cohortDay, size, by_day: byDay });
  }

  return { horizon_days: horizon, cohorts };
};

const collectEventsFromPartitioned = async (
  adminClient: SupabaseClient,
  fromIso: string,
  toIso: string,
  eventTypes: string[],
  maxRows: number,
) => {
  const safeMax = clamp(maxRows, 1000, 250000);
  if (!eventTypes.length) return { rows: [] as Array<Record<string, unknown>>, truncated: false };

  const pageSize = 2000;
  const pages = Math.ceil(safeMax / pageSize);
  const out: Array<Record<string, unknown>> = [];
  let truncated = false;

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    const { data, error } = await adminClient
      .from("analytics_events_p")
      .select("visitor_id,event_type")
      .in("event_type", eventTypes)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (!rows.length) break;

    out.push(...rows);
    if (out.length >= safeMax) {
      truncated = true;
      break;
    }
    if (rows.length < pageSize) break;
  }

  return { rows: out.slice(0, safeMax), truncated };
};

const buildVisitorFunnel = (
  rows: Array<Record<string, unknown>>,
  steps: string[],
) => {
  const stepSets = new Map<string, Set<string>>();
  steps.forEach((s) => stepSets.set(s, new Set<string>()));

  for (const row of rows) {
    const visitor = typeof row.visitor_id === "string" ? row.visitor_id : "";
    const eventType = typeof row.event_type === "string" ? row.event_type : "";
    if (!visitor || !eventType) continue;
    if (!stepSets.has(eventType)) continue;
    stepSets.get(eventType)!.add(visitor);
  }

  const summary = steps.map((step) => ({
    step,
    unique_visitors: stepSets.get(step)?.size || 0,
  }));

  // Approximate sequential funnel using set intersections (not strict ordering).
  const intersections: Array<{
    from: string;
    to: string;
    visitors: number;
    conversion_rate: number;
  }> = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const from = steps[i];
    const to = steps[i + 1];
    const fromSet = stepSets.get(from) || new Set<string>();
    const toSet = stepSets.get(to) || new Set<string>();
    const visitors = intersectionSize(fromSet, toSet);
    intersections.push({
      from,
      to,
      visitors,
      conversion_rate: fromSet.size ? visitors / fromSet.size : 0,
    });
  }

  return { steps: summary, intersections };
};

const aggregateTopPages = (
  rows: Array<Record<string, unknown>>,
  limit = 20,
) => {
  const agg = new Map<string, { events: number; unique: number }>();
  for (const row of rows) {
    const venueRef = typeof row.venue_ref === "string" ? row.venue_ref : "";
    const eventType = typeof row.event_type === "string" ? row.event_type : "";
    if (!venueRef || !eventType) continue;
    if (eventType.toLowerCase() !== "page_view") continue;
    if (!venueRef.startsWith("/")) continue;

    const events = Number(row.events_count) || 0;
    const unique = Number(row.unique_visitors) || 0;
    const current = agg.get(venueRef) || { events: 0, unique: 0 };
    current.events += events;
    current.unique += unique;
    agg.set(venueRef, current);
  }

  return Array.from(agg.entries())
    .map(([path, v]) => ({ path, events: v.events, unique_visitors: v.unique }))
    .sort((a, b) => b.events - a.events)
    .slice(0, clamp(limit, 1, 100));
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
    if (!isAdminUser(user)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const days = clamp(Number(body.days) || 7, 1, 31);
    const from = asDate(body.from);
    const to = asDate(body.to);
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const eventType = typeof body.event_type === "string" ? body.event_type.trim() : "";
    const recentLimit = clamp(Number(body.recent_limit) || 50, 0, 200);

    const now = new Date();
    const rangeTo = to || now;
    const rangeFrom = from || new Date(rangeTo.getTime() - days * 24 * 60 * 60 * 1000);

    const rangeDays =
      (rangeTo.getTime() - rangeFrom.getTime()) / (24 * 60 * 60 * 1000);
    if (!Number.isFinite(rangeDays) || rangeDays <= 0 || rangeDays > 31) {
      return new Response(
        JSON.stringify({ error: "Invalid range (max 31 days)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const fromIso = toIso(rangeFrom);
    const toIsoValue = toIso(rangeTo);
    const fromDay = toDay(rangeFrom);
    const toDayValue = toDay(rangeTo);

    const sessionsTimeColumn = await pickSessionsTimeColumn(adminClient, fromIso, toIsoValue);
    const maxRows = clamp(
      Number(Deno.env.get("ANALYTICS_DASHBOARD_MAX_SESSION_ROWS") || "50000") || 50000,
      1000,
      250000,
    );

    const sessionsTotal = await countSessions(
      adminClient,
      sessionsTimeColumn,
      fromIso,
      toIsoValue,
      country || undefined,
    );
    const sessionAgg = await collectSessions(
      adminClient,
      sessionsTimeColumn,
      fromIso,
      toIsoValue,
      country || undefined,
      maxRows,
    );

    const liveVisitors15m = await collectLiveVisitors(adminClient);
    const recentSessions = await collectRecentSessions(
      adminClient,
      sessionsTimeColumn,
      fromIso,
      toIsoValue,
      country || undefined,
      recentLimit,
    );

    const sortedDays = sessionAgg.sessionsByDay.map((d) => d.day).sort();
    const lastDay = sortedDays[sortedDays.length - 1] || toDayValue;
    const dau = sessionAgg.sessionsByDay.find((d) => d.day === lastDay)?.unique_visitors || 0;

    // WAU/MAU are computed within the selected range (bounded to 7/30 days).
    const wauFrom = new Date(rangeTo.getTime() - 7 * 24 * 60 * 60 * 1000);
    const mauFrom = new Date(rangeTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    const wauFromIso = toIso(wauFrom);
    const mauFromIso = toIso(mauFrom);
    const wauTimeColumn = sessionsTimeColumn;

    const wauAgg = await collectSessions(
      adminClient,
      wauTimeColumn,
      wauFromIso,
      toIsoValue,
      country || undefined,
      maxRows,
    );
    const mauAgg = await collectSessions(
      adminClient,
      sessionsTimeColumn,
      mauFromIso,
      toIsoValue,
      country || undefined,
      maxRows,
    );

    // Events (optional): prefer archive_daily when available.
    let eventsSource: "archive_daily" | "hotspot" | "none" = "none";
    let eventsTruncated = false;
    let eventsByDay: Array<{ day: string; events: number }> = [];
    let topVenues: Array<{ venue_ref: string; venue_name?: string; events: number; unique_visitors?: number }> = [];

    const archive = await collectEventsFromArchiveDaily(
      adminClient,
      fromDay,
      toDayValue,
      eventType || undefined,
      clamp(Number(Deno.env.get("ANALYTICS_DASHBOARD_MAX_EVENT_ROWS") || "20000") || 20000, 1000, 200000),
    );

    if (archive.ok) {
      eventsSource = "archive_daily";
      const byDay = new Map<string, number>();
      const byVenue = new Map<string, { events: number; unique: number }>();

      archive.data.forEach((row) => {
        const day = typeof row.day === "string" ? row.day : "";
        const venueRef = typeof row.venue_ref === "string" ? row.venue_ref : "";
        const events = Number(row.events_count) || 0;
        const unique = Number(row.unique_visitors) || 0;

        if (day) byDay.set(day, (byDay.get(day) || 0) + events);
        if (venueRef) {
          const current = byVenue.get(venueRef) || { events: 0, unique: 0 };
          current.events += events;
          current.unique += unique;
          byVenue.set(venueRef, current);
        }
      });

      eventsByDay = Array.from(byDay.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, events]) => ({ day, events }));

      const top = Array.from(byVenue.entries())
        .map(([venue_ref, agg]) => ({
          venue_ref,
          events: agg.events,
          unique_visitors: agg.unique,
        }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 20);

      // Resolve venue names (best-effort, UUID refs only)
      const uuidRefs = top.filter((t) => isUuidLike(t.venue_ref)).map((t) => t.venue_ref);
      const venueNames = new Map<string, string>();
      if (uuidRefs.length) {
        const { data: venuesData } = await adminClient
          .from("venues")
          .select("id,name")
          .in("id", uuidRefs)
          .limit(500);
        (venuesData || []).forEach((v: Record<string, unknown>) => {
          const id = typeof v.id === "string" ? v.id : "";
          const name = typeof v.name === "string" ? v.name : "";
          if (id && name) venueNames.set(id, name);
        });
      }

      topVenues = top.map((t) => ({
        venue_ref: t.venue_ref,
        venue_name: venueNames.get(t.venue_ref),
        events: t.events,
        unique_visitors: t.unique_visitors,
      }));
    } else {
      // Fallback: show current hotspot snapshot (if available) for "top venues now".
      const hotspotTop = await collectTopVenuesFromHotspot(adminClient);
      if (hotspotTop.length) {
        eventsSource = "hotspot";
        topVenues = hotspotTop.map((t) => ({
          venue_ref: t.venue_ref,
          events: t.events,
          unique_visitors: t.unique_visitors,
        }));
      }
    }

    // Top pages (page_view): aggregate from archive_daily if present.
    let topPages: Array<{ path: string; events: number; unique_visitors: number }> = [];
    const wantsPageViewOnly = (eventType || "").toLowerCase() === "page_view";
    if (archive.ok) {
      topPages = aggregateTopPages(archive.data, 20);
    }
    if (!topPages.length && !wantsPageViewOnly) {
      const pageArchive = await collectEventsFromArchiveDaily(
        adminClient,
        fromDay,
        toDayValue,
        "page_view",
        clamp(
          Number(Deno.env.get("ANALYTICS_DASHBOARD_MAX_PAGE_ROWS") || "20000") || 20000,
          1000,
          200000,
        ),
      );
      if (pageArchive.ok) {
        topPages = aggregateTopPages(pageArchive.data, 20);
      }
    }

    // Retention cohorts (derived from sessions table, bounded by maxRows).
    const retention = buildRetentionCohorts(
      sessionAgg.uniqueVisitorsByDayMap,
      sessionAgg.sessionsByDay.map((d) => d.day),
      {
        horizonDays: clamp(Number(Deno.env.get("ANALYTICS_RETENTION_HORIZON_DAYS") || "7") || 7, 1, 14),
        maxCohorts: clamp(Number(Deno.env.get("ANALYTICS_RETENTION_MAX_COHORTS") || "7") || 7, 1, 14),
      },
    );

    // Funnels (best-effort): based on distinct visitors in analytics_events_p (bounded).
    const funnelSteps = ["view_venue", "checkout_start", "checkout_paid"];
    const maxFunnelRows = clamp(
      Number(Deno.env.get("ANALYTICS_DASHBOARD_MAX_FUNNEL_EVENT_ROWS") || "100000") || 100000,
      1000,
      250000,
    );

    let funnelSource: "analytics_events_p" | "none" = "none";
    let funnelTruncated = false;
    let funnel: { steps: Array<{ step: string; unique_visitors: number }>; intersections: Array<{ from: string; to: string; visitors: number; conversion_rate: number }> } =
      { steps: [], intersections: [] };

    try {
      const funnelRows = await collectEventsFromPartitioned(
        adminClient,
        fromIso,
        toIsoValue,
        funnelSteps,
        maxFunnelRows,
      );
      funnelSource = "analytics_events_p";
      funnelTruncated = funnelRows.truncated;
      funnel = buildVisitorFunnel(funnelRows.rows, funnelSteps);
    } catch {
      // ignore (keep "none")
    }

    const payload = {
      success: true,
      request_id: requestId,
      range: {
        from: fromIso,
        to: toIsoValue,
        days: Math.ceil(rangeDays),
        sessions_time_column: sessionsTimeColumn,
        truncated: sessionAgg.truncated,
        max_session_rows: maxRows,
      },
      kpis: {
        sessions_total: sessionsTotal,
        unique_visitors_total: sessionAgg.uniqueVisitors.size,
        live_visitors_15m: liveVisitors15m,
        dau,
        wau: wauAgg.uniqueVisitors.size,
        mau: mauAgg.uniqueVisitors.size,
      },
      sessions_by_day: sessionAgg.sessionsByDay,
      top_countries: sessionAgg.topCountries,
      recent_sessions: recentSessions,
      retention,
      funnel: {
        source: funnelSource,
        truncated: funnelTruncated,
        ...funnel,
      },
      events: {
        source: eventsSource,
        truncated: eventsTruncated,
        events_by_day: eventsByDay,
        top_venues: topVenues,
        top_pages: topPages,
      },
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.warn("[admin-analytics-dashboard]", requestId, error?.message || error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
