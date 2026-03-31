import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminUser } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sheet-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_SYNC_LIMIT = 2000;
const DEFAULT_SYNC_LIMIT = 200;

const SHEET_DAILY = "Daily Stats";
const SHEET_TH = "TH Slips";
const SHEET_FOREIGN = "International Slips";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const DAILY_HEADERS = ["date", "sessions_count", "new_users_count"];
const SLIP_HEADERS = [
  "order_created_at",
  "order_id",
  "order_status",
  "payment_method",
  "amount",
  "sku",
  "visitor_id",
  "user_id",
  "user_display_name",
  "user_avatar_url",
  "user_bio",
  "user_coins",
  "user_xp",
  "user_level",
  "user_metadata_json",
  "user_profile_created_at",
  "user_profile_updated_at",
  "buyer_country",
  "buyer_email",
  "buyer_full_name",
  "buyer_phone",
  "buyer_address_line1",
  "buyer_address_line2",
  "buyer_province",
  "buyer_district",
  "buyer_postal",
  "consent_personal_data",
  "ip_address",
  "ip_hash",
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_postal",
  "geo_timezone",
  "geo_loc",
  "geo_org",
  "user_agent",
  "slip_url",
  "order_updated_at",
  "order_metadata_json",
  "audit_created_at",
];

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

type SyncScope = "all" | "th" | "foreign";

type LedgerRow = {
  source_pk: string;
  sheet_row_index: number | null;
  row_hash: string;
};

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
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

const safeJson = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPem = (key: string) => {
  if (key.includes("BEGIN PRIVATE KEY")) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
};

const decodeServiceAccount = (raw: string): GoogleServiceAccount => {
  let jsonText = raw.trim();
  if (!jsonText.startsWith("{")) {
    try {
      jsonText = atob(jsonText);
    } catch {
      // Keep original string; parse below will throw with a clear error.
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT must be valid JSON or base64 JSON: ${String(error)}`,
    );
  }

  const clientEmail = (parsed as Record<string, unknown>)?.client_email;
  const privateKey = (parsed as Record<string, unknown>)?.private_key;
  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is missing client_email/private_key");
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
};

const base64UrlEncode = (input: Uint8Array) => {
  let binary = "";
  for (const b of input) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const base64 = formatPem(pem)
    .replace(/-----\w+ PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getGoogleAuthToken = async (rawServiceAccount: string) => {
  const serviceAccount = decodeServiceAccount(rawServiceAccount);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: GOOGLE_TOKEN_URL,
    scope: GOOGLE_SCOPE,
    iat,
    exp,
  };

  const encoder = new TextEncoder();
  const headerEncoded = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
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

const normalizeHeaderValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isSameHeader = (actual: unknown[], expected: string[]) => {
  if (!Array.isArray(actual) || actual.length < expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (normalizeHeaderValue(actual[i]) !== normalizeHeaderValue(expected[i])) {
      return false;
    }
  }
  return true;
};

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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }
  return String(error);
};

const readRow = async (
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  token: string,
) => {
  const range = encodeURIComponent(`${sheetName}!A${rowIndex}:ZZ${rowIndex}`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheet read failed (${sheetName} row ${rowIndex}): ${text}`);
  }

  const data = await res.json();
  return (data?.values?.[0] || []) as unknown[];
};

const clearRow = async (
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  token: string,
) => {
  const range = encodeURIComponent(`${sheetName}!A${rowIndex}:ZZ${rowIndex}`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheet clear failed (${sheetName} row ${rowIndex}): ${text}`);
  }
};

const appendRow = async (
  spreadsheetId: string,
  sheetName: string,
  values: unknown[],
  token: string,
) => {
  const range = encodeURIComponent(`${sheetName}!A:ZZ`);
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
  const range = encodeURIComponent(`${sheetName}!A${rowIndex}:ZZ${rowIndex}`);
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

const ensureHeaderRow = async (
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  token: string,
) => {
  const currentHeader = await readRow(spreadsheetId, sheetName, 1, token);
  if (isSameHeader(currentHeader, headers)) return;
  await clearRow(spreadsheetId, sheetName, 1, token);
  await updateRow(spreadsheetId, sheetName, 1, headers, token);
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

const loadUserProfileMap = async (
  adminClient: ReturnType<typeof createClient>,
  orders: Array<Record<string, unknown>>,
) => {
  const ids = [
    ...new Set(
      orders
        .map((order) => String(order.user_id || "").trim())
        .filter(Boolean),
    ),
  ];
  const out = new Map<string, Record<string, unknown>>();
  if (!ids.length) return out;

  const CHUNK_SIZE = 200;
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const chunk = ids.slice(index, index + CHUNK_SIZE);
    const { data, error } = await adminClient
      .from("user_profiles")
      .select(
        "user_id,display_name,avatar_url,bio,coins,xp,level,metadata,created_at,updated_at",
      )
      .in("user_id", chunk);
    if (error) throw error;

    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const userId = String(row.user_id || "").trim();
      if (userId) out.set(userId, row);
    }
  }

  return out;
};

const getLastOrdersSyncAt = async (
  adminClient: ReturnType<typeof createClient>,
) => {
  const { data, error } = await adminClient
    .from("sheet_sync_ledger")
    .select("last_synced_at")
    .eq("source_table", "orders")
    .order("last_synced_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  const lastSyncedAt = data?.[0]?.last_synced_at;
  return typeof lastSyncedAt === "string" ? new Date(lastSyncedAt).toISOString() : null;
};

const syncOrderBatch = async (
  adminClient: ReturnType<typeof createClient>,
  spreadsheetId: string,
  token: string,
  orders: Array<Record<string, unknown>>,
  scope: SyncScope,
  stats: SyncResponseStats,
) => {
  const userProfiles = await loadUserProfileMap(adminClient, orders);
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
      const userProfile =
        userProfiles.get(String(order.user_id || "").trim()) || {};
      const values = [
        order.created_at || "",
        order.id || "",
        order.status || "",
        order.payment_method || "",
        order.amount ?? 0,
        order.sku || "",
        order.visitor_id || "",
        order.user_id || "",
        userProfile.display_name || "",
        userProfile.avatar_url || "",
        userProfile.bio || "",
        asNumber(userProfile.coins, 0),
        asNumber(userProfile.xp, 0),
        asNumber(userProfile.level, 0),
        safeJson(userProfile.metadata),
        userProfile.created_at || "",
        userProfile.updated_at || "",
        audit?.buyer_country || "TH",
        audit?.buyer_email || "",
        audit?.buyer_full_name || "",
        audit?.buyer_phone || "",
        audit?.buyer_address_line1 || "",
        audit?.buyer_address_line2 || "",
        audit?.buyer_province || "",
        audit?.buyer_district || "",
        audit?.buyer_postal || "",
        audit?.consent_personal_data === true ? "true" : "false",
        audit?.ip_address || "",
        audit?.ip_hash || "",
        audit?.geo_country || "",
        audit?.geo_region || "",
        audit?.geo_city || "",
        audit?.geo_postal || "",
        audit?.geo_timezone || "",
        audit?.geo_loc || "",
        audit?.geo_org || "",
        audit?.user_agent || "",
        order.slip_url || "",
        order.updated_at || "",
        safeJson(order.metadata),
        audit?.created_at || "",
      ];
      await runRowSync(adminClient, spreadsheetId, token, {
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
      const userProfile =
        userProfiles.get(String(order.user_id || "").trim()) || {};
      const values = [
        order.created_at || "",
        order.id || "",
        order.status || "",
        order.payment_method || "",
        order.amount ?? 0,
        order.sku || "",
        order.visitor_id || "",
        order.user_id || "",
        userProfile.display_name || "",
        userProfile.avatar_url || "",
        userProfile.bio || "",
        asNumber(userProfile.coins, 0),
        asNumber(userProfile.xp, 0),
        asNumber(userProfile.level, 0),
        safeJson(userProfile.metadata),
        userProfile.created_at || "",
        userProfile.updated_at || "",
        audit?.buyer_country || "UNKNOWN",
        audit?.buyer_email || "",
        audit?.buyer_full_name || "",
        audit?.buyer_phone || "",
        audit?.buyer_address_line1 || "",
        audit?.buyer_address_line2 || "",
        audit?.buyer_province || "",
        audit?.buyer_district || "",
        audit?.buyer_postal || "",
        audit?.consent_personal_data === true ? "true" : "false",
        audit?.ip_address || "",
        audit?.ip_hash || "",
        audit?.geo_country || "",
        audit?.geo_region || "",
        audit?.geo_city || "",
        audit?.geo_postal || "",
        audit?.geo_timezone || "",
        audit?.geo_loc || "",
        audit?.geo_org || "",
        audit?.user_agent || "",
        order.slip_url || "",
        order.updated_at || "",
        safeJson(order.metadata),
        audit?.created_at || "",
      ];
      await runRowSync(adminClient, spreadsheetId, token, {
        sourceTable: "orders",
        sourcePk: String(order.id),
        sheetName: SHEET_FOREIGN,
        values,
        stats: stats.foreign,
        ledgerMap: ledger,
      });
    }
  }
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

    const googleToken = await getGoogleAuthToken(serviceAccountJson);
    await ensureHeaderRow(googleSheetId, SHEET_DAILY, DAILY_HEADERS, googleToken);
    await ensureHeaderRow(googleSheetId, SHEET_TH, SLIP_HEADERS, googleToken);
    await ensureHeaderRow(googleSheetId, SHEET_FOREIGN, SLIP_HEADERS, googleToken);

    const now = new Date();
    const toIso = asIsoDate(body.to) || now.toISOString();
    let fromIso = asIsoDate(body.from);

    if (!fromIso && mode === "incremental") {
      fromIso = await getLastOrdersSyncAt(adminClient);
    }

    if (fromIso && new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      throw new Error("Invalid range: from must be before to");
    }

    const timeColumn = mode === "incremental" ? "updated_at" : "created_at";
    let offset = 0;

    while (true) {
      let slipsQuery = adminClient
        .from("orders")
        .select(
          `id,sku,amount,status,slip_url,created_at,updated_at,visitor_id,user_id,payment_method,metadata,
           slip_audit!left(
             buyer_country,buyer_email,buyer_full_name,buyer_phone,buyer_address_line1,buyer_address_line2,
             buyer_province,buyer_district,buyer_postal,consent_personal_data,ip_address,ip_hash,user_agent,
             geo_country,geo_region,geo_city,geo_postal,geo_timezone,geo_loc,geo_org,created_at
           )`,
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);

      if (fromIso) slipsQuery = slipsQuery.gte(timeColumn, fromIso);
      if (toIso) slipsQuery = slipsQuery.lte(timeColumn, toIso);

      const { data: rawOrders, error: ordersError } = await slipsQuery;
      if (ordersError) throw ordersError;

      const orders = (rawOrders || []) as Array<Record<string, unknown>>;
      if (!orders.length) break;

      await syncOrderBatch(
        adminClient,
        googleSheetId,
        googleToken,
        orders,
        scope,
        stats,
      );

      if (orders.length < limit) break;
      offset += limit;
    }

    const dailyDate =
      asDateOnly(body.daily_date) ||
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyStart = `${dailyDate}T00:00:00.000Z`;
    const dailyEnd = `${dailyDate}T23:59:59.999Z`;

    const { count: rawSessionCount, error: sessionErr } = await adminClient
      .from("analytics_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dailyStart)
      .lte("created_at", dailyEnd);
    if (sessionErr && !isMissingTableError(sessionErr, "analytics_sessions")) {
      throw sessionErr;
    }
    const sessionCount = sessionErr ? 0 : (rawSessionCount || 0);

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
      values: [dailyDate, sessionCount, userCount],
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
    const message = getErrorMessage(error);
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
