import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COR_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: COR_HEADERS });
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action_type } = await req.json();
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let amount = 0;
    let description = "";
    let idempotencyKey = "";

    // -- 1. Logic for Actions --
    if (action_type === "daily_checkin") {
      amount = 10;
      description = "Daily Check-in";
      idempotencyKey = `daily_${user.id}_${new Date().toISOString().split("T")[0]}`; // one per day
    } else if (action_type === "add_venue") {
      amount = 50;
      description = "Added New Venue";
      // Idempotency should ideally come from the venue ID, but for now we trust the client slightly less or need venue_id passed
      // For MVP, we allow it but maybe limit rate?
      idempotencyKey = `add_venue_${user.id}_${Date.now()}`;
    } else if (action_type === "check_in") {
      amount = 10;
      description = "Venue Check-in";
      // Allow multiple check-ins per day but maybe different venues?
      // For MVP, just allow it.
      idempotencyKey = `check_in_${user.id}_${Date.now()}`;
    } else {
      throw new Error("Invalid action type");
    }

    // -- 2. Check Idempotency (Prevent Double Claim) --
    const { data: existing } = await adminClient
      .from("coin_ledger")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, message: "Already claimed" }),
        {
          headers: { ...COR_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // -- 3. Insert Ledger Entry --
    const { error: ledgerError } = await adminClient
      .from("coin_ledger")
      .insert({
        user_id: user.id,
        amount,
        description,
        transaction_type: action_type,
        idempotency_key: idempotencyKey,
      });

    if (ledgerError) throw ledgerError;

    // -- 4. Update Denormalized User Stats (Optional but fast) --
    // We can use an RPC to Recalculate or just increment.
    // For MVP, letting the client re-fetch balance or having a trigger is safer.
    // Ideally, a Database Trigger on coin_ledger updates user_stats.

    return new Response(
      JSON.stringify({ success: true, amount, new_balance: null }),
      {
        headers: { ...COR_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...COR_HEADERS, "Content-Type": "application/json" },
    });
  }
});
