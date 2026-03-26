import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdminUser } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
    const offset = Math.max(Number(body.offset) || 0, 0);
    const buyerName = typeof body.buyer_name === "string"
      ? body.buyer_name.trim()
      : "";
    const buyerEmail = typeof body.buyer_email === "string"
      ? body.buyer_email.trim()
      : "";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

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
        { count: "exact" },
      )
      .eq("payment_method", "manual_transfer")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const escapeLike = (value: string) =>
      value.replace(/%/g, "\\%").replace(/_/g, "\\_");

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

    const { data, error, count } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ data, count, limit, offset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
