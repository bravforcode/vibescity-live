import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { isAdminUser } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const extractVerification = (metadata: unknown) => {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed?.slip_verification || {};
    } catch {
      return {};
    }
  }
  return (metadata as { slip_verification?: Record<string, unknown> })
    ?.slip_verification || {};
};

const getSlipAudit = (order: Record<string, unknown>) => {
  const audit = order?.slip_audit as unknown;
  if (Array.isArray(audit)) return audit[0] || {};
  return audit || {};
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

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const maxRows = Math.min(
      Number(Deno.env.get("SLIP_EXPORT_MAX_ROWS") || "5000"),
      20000,
    );

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
    const status = typeof body.status === "string" ? body.status : "";
    const search = typeof body.search === "string" ? body.search.trim() : "";
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    const mode = body.mode === "all" ? "all" : "page";
    const zipBy: "status" | "date" | null =
      body.zip_by === "status" || body.zip_by === "date"
        ? body.zip_by
        : body.zipBy === "status" || body.zipBy === "date"
        ? body.zipBy
        : null;
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
    const offset = Math.max(Number(body.offset) || 0, 0);
    const buyerName = typeof body.buyer_name === "string"
      ? body.buyer_name.trim()
      : "";
    const buyerEmail = typeof body.buyer_email === "string"
      ? body.buyer_email.trim()
      : "";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const escapeLike = (value: string) =>
      value.replace(/%/g, "\\%").replace(/_/g, "\\_");

    const buildQuery = (queryLimit: number, queryOffset: number) => {
      let query = adminClient
        .from("orders")
        .select(
          `id, venue_id, visitor_id, sku, amount, status, payment_method, slip_url, metadata, created_at, updated_at,
           slip_audit (
             buyer_full_name,
             buyer_phone,
             buyer_email,
             buyer_address_line1,
             buyer_address_line2,
             buyer_country,
             buyer_province,
             buyer_district,
             buyer_postal,
             ip_address,
             user_agent,
             geo_country,
             geo_region,
             geo_city,
             geo_postal,
             geo_timezone,
             geo_loc,
             geo_org,
             consent_personal_data,
             created_at
           )`,
        )
        .eq("payment_method", "manual_transfer")
        .order("created_at", { ascending: false })
        .range(queryOffset, queryOffset + queryLimit - 1);

      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      if (search) {
        const safeSearch = escapeLike(search);
        query = query.or(
          `sku.ilike.%${safeSearch}%,visitor_id.ilike.%${safeSearch}%`,
        );
      }
      if (buyerName) {
        const safe = escapeLike(buyerName);
        query = query.ilike("slip_audit.buyer_full_name", `%${safe}%`);
      }
      if (buyerEmail) {
        const safe = escapeLike(buyerEmail);
        query = query.ilike("slip_audit.buyer_email", `%${safe}%`);
      }
      return query;
    };

    let rows: Array<Record<string, unknown>> = [];
    if (mode === "page") {
      const { data, error } = await buildQuery(limit, offset);
      if (error) throw error;
      rows = data || [];
    } else {
      let collected = 0;
      let pageOffset = 0;
      const pageSize = 200;
      while (collected < maxRows) {
        const { data, error } = await buildQuery(pageSize, pageOffset);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        collected += data.length;
        pageOffset += pageSize;
        if (data.length < pageSize) break;
      }
    }

    const headers = [
      "order_id",
      "status",
      "sku",
      "amount",
      "created_at",
      "updated_at",
      "slip_url",
      "visitor_id",
      "buyer_full_name",
      "buyer_phone",
      "buyer_email",
      "buyer_address_line1",
      "buyer_address_line2",
      "buyer_country",
      "buyer_province",
      "buyer_district",
      "buyer_postal",
      "ip_address",
      "user_agent",
      "geo_country",
      "geo_region",
      "geo_city",
      "geo_postal",
      "geo_timezone",
      "geo_loc",
      "geo_org",
      "verification_status",
      "verification_reason",
      "trans_ref",
      "trans_date",
      "sender_name",
      "sender_bank",
      "receiver_name",
      "receiver_bank",
      "receiver_account",
    ];

    const buildCsv = (data: Array<Record<string, unknown>>) => {
      const csvRows = [headers.map(escapeCsv).join(",")];
      data.forEach((order) => {
        const audit = getSlipAudit(order);
        const verification = extractVerification(order.metadata);
        const rowValues = [
          order.id,
          order.status,
          order.sku,
          order.amount,
          order.created_at,
          order.updated_at,
          order.slip_url,
          order.visitor_id,
          audit?.buyer_full_name,
          audit?.buyer_phone,
          audit?.buyer_email,
          audit?.buyer_address_line1,
          audit?.buyer_address_line2,
          audit?.buyer_country,
          audit?.buyer_province,
          audit?.buyer_district,
          audit?.buyer_postal,
          audit?.ip_address,
          audit?.user_agent,
          audit?.geo_country,
          audit?.geo_region,
          audit?.geo_city,
          audit?.geo_postal,
          audit?.geo_timezone,
          audit?.geo_loc,
          audit?.geo_org,
          (verification as { status?: string })?.status,
          (verification as { reason?: string })?.reason,
          (verification as { trans_ref?: string })?.trans_ref,
          (verification as { trans_date?: string })?.trans_date,
          (verification as { sender?: { name?: string } })?.sender?.name,
          (verification as { sender?: { bank?: string } })?.sender?.bank,
          (verification as { receiver?: { name?: string } })?.receiver?.name,
          (verification as { receiver?: { bank?: string } })?.receiver?.bank,
          (verification as { receiver?: { account?: string } })?.receiver?.account,
        ];
        csvRows.push(rowValues.map(escapeCsv).join(","));
      });
      return csvRows.join("\n");
    };

    if (!zipBy) {
      const csvContent = buildCsv(rows);
      const filename = `slip-export-${new Date().toISOString()}.csv`;

      return new Response(csvContent, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Zip export grouped by status or date (YYYY-MM-DD)
    const zip = new JSZip();
    const groups = new Map<string, Array<Record<string, unknown>>>();

    const keyFn = (order: Record<string, unknown>) => {
      if (zipBy === "status") return String(order.status || "unknown");
      const date = (order.created_at || "").toString().slice(0, 10);
      return date || "unknown";
    };

    rows.forEach((row) => {
      const key = keyFn(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(row);
    });

    for (const [group, dataRows] of groups.entries()) {
      const csv = buildCsv(dataRows);
      zip.file(`${group}.csv`, csv);
    }

    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });
    const filename = `slip-export-${zipBy}-${new Date().toISOString()}.zip`;

    return new Response(zipBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
