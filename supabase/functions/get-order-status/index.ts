// supabase/functions/get-order-status/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

const jsonResponse = (payload: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ success: false, error: "Origin not allowed" }, 403, origin);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing authorization" }, 401, origin);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401, origin);
    }

    const body = await req.json();
    const sessionId =
      typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const legacyOrderId =
      typeof body?.orderId === "string" ? body.orderId.trim() : "";

    if (!sessionId && !legacyOrderId) {
      throw new Error("Missing session_id");
    }

    if (!sessionId && legacyOrderId) {
      console.warn("[get-order-status] deprecated payload key received: orderId");
    }

    const selectClause = `
      *,
      entitlements_ledger (
        feature,
        starts_at,
        ends_at
      )
    `;

    let order: Record<string, unknown> | null = null;

    if (sessionId) {
      const { data, error } = await supabase
        .from("orders")
        .select(selectClause)
        .eq("provider", "stripe")
        .eq("provider_order_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      order = data;
    } else {
      const byProvider = await supabase
        .from("orders")
        .select(selectClause)
        .eq("provider_order_id", legacyOrderId)
        .maybeSingle();
      if (byProvider.error) throw byProvider.error;

      if (byProvider.data) {
        order = byProvider.data;
      } else {
        const byId = await supabase
          .from("orders")
          .select(selectClause)
          .eq("id", legacyOrderId)
          .maybeSingle();
        if (byId.error) throw byId.error;
        order = byId.data;
      }
    }

    if (!order) {
      return jsonResponse({ success: true, status: "processing" }, 200, origin);
    }

    return jsonResponse(
      {
        success: true,
        status: String(order.status || "processing"),
        order,
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      400,
      origin,
    );
  }
});
