// supabase/functions/get-order-status/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    // Query Order by Provider ID (Stripe Session ID)
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        entitlements_ledger (
          feature,
          starts_at,
          ends_at
        )
      `,
      )
      .eq("provider", "stripe")
      .eq("provider_order_id", session_id)
      .single();

    if (error) {
      // If not found yet, it might be processing
      return new Response(JSON.stringify({ status: "processing" }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response(
      JSON.stringify({
        status: order.status,
        order: order,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
