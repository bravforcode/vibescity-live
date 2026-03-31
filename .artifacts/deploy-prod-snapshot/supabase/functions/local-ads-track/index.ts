import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown) =>
  typeof value === "string" && UUID_RE.test(value.trim());

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_KEY") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const body = await req.json().catch(() => ({}));
    const event = String(body.event || "").trim().toLowerCase();
    const adId = String(body.ad_id || "").trim();
    const visitorId = String(body.visitor_id || "").trim() || null;
    const sessionId = String(body.session_id || "").trim() || null;
    const context =
      typeof body.context === "object" && body.context ? body.context : {};

    if (!["impression", "click"].includes(event)) {
      throw new Error("Invalid event");
    }
    if (!isUuid(adId)) {
      throw new Error("Invalid ad_id");
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
      userId = user?.id || null;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const table = event === "impression" ? "ad_impressions" : "ad_clicks";
    const venueId =
      typeof context.venue_id === "string" && context.venue_id.trim()
        ? context.venue_id.trim()
        : null;

    const record = {
      ad_id: adId,
      venue_id: venueId,
      user_id: userId,
      visitor_id: visitorId,
      session_id: sessionId,
      metadata: {
        ...context,
        event,
        path: typeof context.path === "string" ? context.path : null,
        ts: new Date().toISOString(),
      },
    };

    if (event === "impression") {
      const { error } = await adminClient.from(table).insert(record);
      if (error) {
        if (
          String(error.code || "") === "23505" ||
          String(error.message || "").toLowerCase().includes("duplicate")
        ) {
          return new Response(JSON.stringify({ success: true, deduped: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw error;
      }
      return new Response(JSON.stringify({ success: true, deduped: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await adminClient.from(table).insert(record);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, deduped: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
