import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-healthcheck-secret",
};

const EASYSLIP_VERIFY_URL = "https://developer.easyslip.com/api/v1/verify";
const EASYSLIP_ACCESS_TOKEN = Deno.env.get("EASYSLIP_ACCESS_TOKEN") || "";
const EASYSLIP_DISABLED =
  (Deno.env.get("EASYSLIP_DISABLED") || "true").toLowerCase() !== "false";
const HEALTHCHECK_URL = Deno.env.get("EASYSLIP_HEALTHCHECK_URL") || "";
const HEALTHCHECK_AMOUNT = Number(
  Deno.env.get("EASYSLIP_HEALTHCHECK_AMOUNT") || "0",
);
const HEALTHCHECK_SECRET = Deno.env.get("EASYSLIP_HEALTHCHECK_SECRET") || "";

const sendDiscord = async (discordUrl: string, payload: unknown) => {
  if (!discordUrl) return;
  try {
    await fetch(discordUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort only
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (EASYSLIP_DISABLED) {
    return new Response(JSON.stringify({ error: "EasySlip deprecated" }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (HEALTHCHECK_SECRET) {
    const secretHeader = req.headers.get("x-healthcheck-secret") || "";
    if (secretHeader !== HEALTHCHECK_SECRET) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const startedAt = Date.now();
  let status = "ok";
  let httpStatus = 0;
  let providerStatus: number | null = null;
  let errorMessage = "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    if (!EASYSLIP_ACCESS_TOKEN || !HEALTHCHECK_URL) {
      throw new Error("Missing EasySlip token or healthcheck URL");
    }

    const resp = await fetch(EASYSLIP_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EASYSLIP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        url: HEALTHCHECK_URL,
        checkDuplicate: false,
      }),
    });

    httpStatus = resp.status;
    const rawText = await resp.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }

    providerStatus = (body as { status?: number })?.status ?? null;
    if (!resp.ok || providerStatus !== 200) {
      status = "error";
      errorMessage =
        (body as { message?: string })?.message ||
        `HTTP ${resp.status}`;
    } else {
      const data = (body as { data?: Record<string, unknown> })?.data || {};
      const amountObj = data.amount as { amount?: number } | undefined;
      const verifiedAmount = Number(amountObj?.amount ?? 0);
      if (HEALTHCHECK_AMOUNT && Math.abs(verifiedAmount - HEALTHCHECK_AMOUNT) > 0.01) {
        status = "error";
        errorMessage = "amount_mismatch";
      }
    }
  } catch (error) {
    status = "error";
    errorMessage = error.message;
  }

  const latencyMs = Date.now() - startedAt;
  await supabase.from("slip_health_checks").insert({
    checked_at: new Date().toISOString(),
    status,
    latency_ms: latencyMs,
    http_status: httpStatus || null,
    provider_status: providerStatus,
    error_message: errorMessage || null,
  });

  if (status !== "ok") {
    const discordUrl =
      Deno.env.get("DISCORD_WEBHOOK_URL") ||
      "https://discord.com/api/webhooks/1468744271388606506/pVLr0S9a98-XMAIcldWZrHnjA6iXAcbDCQfY_z3hlglNGfA5Uz-7Y5IQDMt9p0pSL66a";
    await sendDiscord(discordUrl, {
      username: "VibeCity Order Bot",
      avatar_url: "https://vibecity.live/logo.png",
      embeds: [
        {
          title: "⚠️ EasySlip Healthcheck Failed",
          description: `Status: ${status}\nError: ${errorMessage || "unknown"}`,
          color: 15548997,
          fields: [
            { name: "HTTP", value: `${httpStatus || "N/A"}`, inline: true },
            {
              name: "Provider",
              value: `${providerStatus ?? "N/A"}`,
              inline: true,
            },
            { name: "Latency", value: `${latencyMs}ms`, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  return new Response(
    JSON.stringify({
      status,
      latency_ms: latencyMs,
      http_status: httpStatus,
      provider_status: providerStatus,
      error: errorMessage || null,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
