import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sheet-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_SYNC_LIMIT = 2000;
const DEFAULT_SYNC_LIMIT = 200;
const DEFAULT_INCREMENTAL_WINDOW_HOURS = 24;
const ALLOWED_ORDER_STATUSES = [
  "pending",
  "pending_review",
  "paid",
  "rejected",
];

const SHEET_DAILY = "Daily Stats";
const SHEET_TH = "TH Slips";
const SHEET_FOREIGN = "International Slips";

type SyncStats = {
  inserted: number;
  updated: number;
  skipped: number;
};

type SyncResponseStats = {
  th: SyncStats;
  foreign: SyncStats;
  daily: SyncStats;
};

type LedgerRow = {
  source_pk: string;
  sheet_row_index: number | null;
  row_hash: string;
};

const createEmptyStats = (): SyncStats => ({
  inserted: 0,
  updated: 0,
  skipped: 0,
});

const createResponseStats = (): SyncResponseStats => ({
  th: createEmptyStats(),
  foreign: createEmptyStats(),
  daily: createEmptyStats(),
});

const asIsoDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const asDateOnly = (value: unknown) => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
};

const isAdminUser = (user: { app_metadata?: Record<string, unknown> }) => {
  const meta = user?.app_metadata || {};
  const role = meta.role;
  const roles = Array.isArray(meta.roles) ? meta.roles : [];
  return role === "admin" || role === "super_admin" || roles.includes("admin");
};

const formatPem = (key: string) => {
  if (key.includes("BEGIN PRIVATE KEY")) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
};

const getGoogleAuthToken = async (
  serviceAccountEmail: string,
  privateKey: string,
) => {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccountEmail,
      sub: serviceAccountEmail,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/spreadsheets",
      iat,
      exp,
    },
    formatPem(privateKey),
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google auth failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const extractRowIndex = (updatedRange: string) => {
  const numbers = updatedRange.match(/\d+/g);
  if (!numbers || !numbers.length) return null;
  const parsed = Number(numbers[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const appendRow = async (
  spreadsheetId: string,
  sheetName: string,
  values: unknown[],
  token: string,
) => {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheet append failed (${sheetName}): ${text}`);
  }
  const data = await res.json();
  const updatedRange = data?.updates?.updatedRange || "";
  return extractRowIndex(updatedRange);
};

const updateRow = async (
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  values: unknown[],
  token: string,
) => {
  const range = encodeURIComponent(`${sheetName}!A${rowIndex}:Z${rowIndex}`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheet update failed (${sheetName} row ${rowIndex}): ${text}`);
  }
};

const loadLedgerMap = async (
  adminClient: ReturnType<typeof createClient>,
  sourceTable: string,
  sheetName: string,
  sourcePks: string[],
) => {
  const map = new Map<string, LedgerRow>();
  if (!sourcePks.length) return map;

  const { data, error } = await adminClient
    .from("sheet_sync_ledger")
    .select("source_pk,sheet_row_index,row_hash")
    .eq("source_table", sourceTable)
    .eq("sheet_name", sheetName)
    .in("source_pk", sourcePks);

  if (error) throw error;
  for (const row of data || []) {
    map.set(String(row.source_pk), {
      source_pk: String(row.source_pk),
      sheet_row_index:
        row.sheet_row_index === null ? null : Number(row.sheet_row_index),
      row_hash: String(row.row_hash || ""),
    });
  }
  return map;
};

const upsertLedger = async (
  adminClient: ReturnType<typeof createClient>,
  params: {
    sourceTable: string;
    sourcePk: string;
    sheetName: string;
    rowHash: string;
    rowIndex: number | null;
    payload: Record<string, unknown>;
  },
) => {
  const { error } = await adminClient.from("sheet_sync_ledger").upsert(
    {
      source_table: params.sourceTable,
      source_pk: params.sourcePk,
      sheet_name: params.sheetName,
      sheet_row_index: params.rowIndex,
      row_hash: params.rowHash,
      payload: params.payload,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "source_table,source_pk,sheet_name" },
  );
  if (error) throw error;
};

const runRowSync = async (
  adminClient: ReturnType<typeof createClient>,
  spreadsheetId: string,
  token: string,
  params: {
    sourceTable: string;
    sourcePk: string;
    sheetName: string;
    values: unknown[];
    stats: SyncStats;
    ledgerMap: Map<string, LedgerRow>;
  },
) => {
  const rowHash = await sha256Hex(JSON.stringify(params.values));
  const existing = params.ledgerMap.get(params.sourcePk);

  if (existing && existing.row_hash === rowHash && existing.sheet_row_index) {
    params.stats.skipped += 1;
    return;
  }

  let rowIndex = existing?.sheet_row_index ?? null;
  let didUpdate = false;

  if (rowIndex) {
    try {
      await updateRow(spreadsheetId, params.sheetName, rowIndex, params.values, token);
      params.stats.updated += 1;
      didUpdate = true;
    } catch {
      rowIndex = null;
    }
  }

  if (!didUpdate) {
    const appendedRow = await appendRow(
      spreadsheetId,
      params.sheetName,
      params.values,
      token,
    );
    rowIndex = appendedRow ?? rowIndex;
    params.stats.inserted += 1;
  }

  await upsertLedger(adminClient, {
    sourceTable: params.sourceTable,
    sourcePk: params.sourcePk,
    sheetName: params.sheetName,
    rowHash,
    rowIndex,
    payload: { values: params.values },
  });

  params.ledgerMap.set(params.sourcePk, {
    source_pk: params.sourcePk,
    sheet_row_index: rowIndex,
    row_hash: rowHash,
  });
};

const getAudit = (order: Record<string, unknown>) => {
  const raw = order?.slip_audit as unknown;
  if (Array.isArray(raw)) return raw[0] || {};
  return raw || {};
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
  let runId: string | null = null;
  let runStarted = false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const googleSheetId = Deno.env.get("GOOGLE_SHEET_ID") || "";
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT") || "";
  const cronSecret = Deno.env.get("SHEET_SYNC_SECRET") || "";

  // Fail fast: validate all required env vars before doing any work
  const missingEnv = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey],
    ["GOOGLE_SHEET_ID", googleSheetId],
    ["GOOGLE_SERVICE_ACCOUNT", serviceAccountJson],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missingEnv.length > 0) {
    return new Response(
      JSON.stringify({
        error: `Missing required env vars: ${missingEnv.join(", ")}`,
        request_id: requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {

    const authHeader = req.headers.get("Authorization") || "";
    const incomingCronSecret = req.headers.get("x-sheet-sync-secret") || "";

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "incremental";
    const scope =
      body.scope === "th" || body.scope === "foreign" ? body.scope : "all";
    const limit = Math.min(
      Math.max(Number(body.limit) || DEFAULT_SYNC_LIMIT, 1),
      MAX_SYNC_LIMIT,
    );
    const stats = createResponseStats();
    let actorId: string | null = null;

    const canUseCronSecret =
      Boolean(cronSecret) &&
      Boolean(incomingCronSecret) &&
      incomingCronSecret === cronSecret;
    const triggeredBy = canUseCronSecret ? "cron" : "manual";

    if (!canUseCronSecret) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing auth" }), {
          status: 401,
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

      if (!isAdminUser(user)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actorId = user.id;
    }

    const runInsert = await adminClient
      .from("sheet_sync_runs")
      .insert({
        triggered_by: triggeredBy,
        actor_id: actorId,
        request_payload: {
          mode,
          scope,
          limit,
          from: body.from || null,
          to: body.to || null,
          request_id: requestId,
        },
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!runInsert.error && runInsert.data?.id) {
      runId = String(runInsert.data.id);
      runStarted = true;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const googleToken = await getGoogleAuthToken(
      serviceAccount.client_email,
      serviceAccount.private_key,
    );

    const now = new Date();
    const toIso = asIsoDate(body.to) || now.toISOString();
    let fromIso = asIsoDate(body.from);

    if (!fromIso && mode === "incremental") {
      fromIso = new Date(
        now.getTime() - DEFAULT_INCREMENTAL_WINDOW_HOURS * 60 * 60 * 1000,
      ).toISOString();
    }

    if (fromIso && new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      throw new Error("Invalid range: from must be before to");
    }

    let slipsQuery = adminClient
      .from("orders")
      .select(
        `id,sku,amount,status,slip_url,created_at,updated_at,visitor_id,payment_method,
         slip_audit!left(buyer_country,buyer_email,buyer_full_name)`,
      )
      .eq("payment_method", "manual_transfer")
      .in("status", ALLOWED_ORDER_STATUSES)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fromIso) slipsQuery = slipsQuery.gte("created_at", fromIso);
    if (toIso) slipsQuery = slipsQuery.lte("created_at", toIso);

    const { data: rawOrders, error: ordersError } = await slipsQuery;
    if (ordersError) throw ordersError;

    const orders = (rawOrders || []) as Array<Record<string, unknown>>;

    const thOrders: Array<Record<string, unknown>> = [];
    const foreignOrders: Array<Record<string, unknown>> = [];

    for (const order of orders) {
      const audit = getAudit(order) as Record<string, unknown>;
      const country = String(audit?.buyer_country || "")
        .trim()
        .toUpperCase();
      if (country === "TH") thOrders.push(order);
      else foreignOrders.push(order);
    }

    if (scope !== "foreign") {
      const ids = thOrders.map((o) => String(o.id));
      const ledger = await loadLedgerMap(adminClient, "orders", SHEET_TH, ids);
      for (const order of thOrders) {
        const audit = getAudit(order) as Record<string, unknown>;
        const values = [
          order.created_at || "",
          order.id || "",
          order.status || "",
          order.amount ?? 0,
          order.sku || "",
          audit?.buyer_country || "TH",
          audit?.buyer_email || "",
          audit?.buyer_full_name || "",
          order.slip_url || "",
        ];
        await runRowSync(adminClient, googleSheetId, googleToken, {
          sourceTable: "orders",
          sourcePk: String(order.id),
          sheetName: SHEET_TH,
          values,
          stats: stats.th,
          ledgerMap: ledger,
        });
      }
    }

    if (scope !== "th") {
      const ids = foreignOrders.map((o) => String(o.id));
      const ledger = await loadLedgerMap(adminClient, "orders", SHEET_FOREIGN, ids);
      for (const order of foreignOrders) {
        const audit = getAudit(order) as Record<string, unknown>;
        const values = [
          order.created_at || "",
          order.id || "",
          order.status || "",
          order.amount ?? 0,
          order.sku || "",
          audit?.buyer_country || "UNKNOWN",
          audit?.buyer_email || "",
          audit?.buyer_full_name || "",
          order.slip_url || "",
        ];
        await runRowSync(adminClient, googleSheetId, googleToken, {
          sourceTable: "orders",
          sourcePk: String(order.id),
          sheetName: SHEET_FOREIGN,
          values,
          stats: stats.foreign,
          ledgerMap: ledger,
        });
      }
    }

    const dailyDate =
      asDateOnly(body.daily_date) ||
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyStart = `${dailyDate}T00:00:00.000Z`;
    const dailyEnd = `${dailyDate}T23:59:59.999Z`;

    const { count: sessionCount, error: sessionErr } = await adminClient
      .from("analytics_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dailyStart)
      .lte("created_at", dailyEnd);
    if (sessionErr) throw sessionErr;

    let userCount = 0;
    const { count: profileCount, error: profileErr } = await adminClient
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dailyStart)
      .lte("created_at", dailyEnd);
    if (!profileErr) {
      userCount = profileCount || 0;
    }

    const dailySourcePk = `daily:${dailyDate}`;
    const dailyLedger = await loadLedgerMap(adminClient, "daily_stats", SHEET_DAILY, [
      dailySourcePk,
    ]);

    await runRowSync(adminClient, googleSheetId, googleToken, {
      sourceTable: "daily_stats",
      sourcePk: dailySourcePk,
      sheetName: SHEET_DAILY,
      values: [dailyDate, sessionCount || 0, userCount],
      stats: stats.daily,
      ledgerMap: dailyLedger,
    });

    if (runStarted && runId) {
      await adminClient.from("sheet_sync_runs").update({
        status: "success",
        result_stats: stats,
        ended_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({ success: true, run_id: runId, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runStarted && runId) {
      await adminClient.from("sheet_sync_runs").update({
        status: "failed",
        error: message,
        ended_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: message, request_id: requestId }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
