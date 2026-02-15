// supabase/functions/manage-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

type ManageAction = "cancel" | "resume";

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
    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      throw new Error("Stripe is not configured");
    }
    if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing authorization" }, 401, origin);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401, origin);
    }

    const body = await req.json();
    const action = String(body?.action || "").trim() as ManageAction;
    const subscriptionId = String(body?.subscriptionId || "").trim();
    if (!subscriptionId) throw new Error("Subscription ID required");
    if (!["cancel", "resume"].includes(action)) throw new Error("Invalid action");

    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, stripe_subscription_id, cancel_at_period_end, status")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (subError) throw subError;
    if (!subscription) {
      return jsonResponse({ success: false, error: "Subscription not found" }, 404, origin);
    }

    if (!subscription.user_id || subscription.user_id !== user.id) {
      return jsonResponse(
        { success: false, error: "Subscription ownership mismatch" },
        403,
        origin,
      );
    }

    const cancelAtPeriodEnd = action === "cancel";
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    if (updateError) throw updateError;

    return jsonResponse(
      {
        success: true,
        status: cancelAtPeriodEnd ? "canceled_at_period_end" : "active",
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      400,
      origin,
    );
  }
});
