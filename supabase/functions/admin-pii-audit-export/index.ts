import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canViewPiiAudit } from "../_shared/admin.ts";

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

const csvEscape = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

type SupabaseClient = ReturnType<typeof createClient>;

const isMissingTableError = (error: unknown, tableName: string) => {
  const payload = (error || {}) as Record<string, unknown>;
  const code = String(payload.code || "").toUpperCase();
  const message = String(payload.message || "").toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return (
    code === "PGRST205" ||
    (message.includes("could not find the table") && message.includes(table))
  );
};

const fetchSessionsPaged = async (
  adminClient: SupabaseClient,
  fromIso: string,
  toIso: string,
  country?: string,
  maxRows = 5000,
) => {
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);
  const out: Array<Record<string, unknown>> = [];

  for (let page = 0; page < pages; page++) {
    const offset = page * pageSize;
    let q = adminClient
      .from("pii_audit_sessions")
      .select("visitor_id,user_id,ip_raw,user_agent,country,city,started_at,last_seen_at,created_at")
      .gte("last_seen_at", fromIso)
      .lt("last_seen_at", toIso)
      .order("last_seen_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (country) q = q.eq("country", country);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
    if (out.length >= maxRows) break;
  }

  return out.slice(0, maxRows);
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

    const [sessionsProbe, accessLogProbe] = await Promise.all([
      adminClient.from("pii_audit_sessions").select("id").limit(1),
      adminClient.from("pii_audit_access_log").select("id").limit(1),
    ]);
    if (
      isMissingTableError(sessionsProbe.error, "pii_audit_sessions") ||
      isMissingTableError(accessLogProbe.error, "pii_audit_access_log")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "PII audit tables are missing. Run the PII audit migrations before exporting.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const maxRows = clamp(
      Number(Deno.env.get("PII_AUDIT_EXPORT_MAX_ROWS") || "5000") || 5000,
      100,
      50000,
    );

    const sessions = await fetchSessionsPaged(
      adminClient,
      fromIso,
      toIsoValue,
      country || undefined,
      maxRows,
    );

    const lines = [];
    lines.push(
      [
        "visitor_id",
        "user_id",
        "ip_raw",
        "country",
        "city",
        "started_at",
        "last_seen_at",
        "user_agent",
        "created_at",
      ].join(","),
    );

    for (const row of sessions) {
      lines.push(
        [
          csvEscape(row.visitor_id),
          csvEscape(row.user_id),
          csvEscape(row.ip_raw),
          csvEscape(row.country),
          csvEscape(row.city),
          csvEscape(row.started_at),
          csvEscape(row.last_seen_at),
          csvEscape(row.user_agent),
          csvEscape(row.created_at),
        ].join(","),
      );
    }

    const filters = {
      from: fromIso,
      to: toIsoValue,
      country: country || null,
      max_rows: maxRows,
      exported_rows: sessions.length,
    };
    await adminClient
      .from("pii_audit_access_log")
      .insert({ actor_user_id: user.id, action: "export", filters })
      .catch(() => {});

    const filename = `pii-audit-${toDay(rangeFrom)}_to_${toDay(rangeTo)}.csv`;
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[admin-pii-audit-export]", requestId, "error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
