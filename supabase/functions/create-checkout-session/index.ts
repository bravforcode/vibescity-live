import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

const SITE_URL = Deno.env.get("SITE_URL") || "https://vibecity.live";

const SUBSCRIPTION_DEFAULT_SKUS = new Set([
  "giant_monthly",
  "video_pin",
  "vip_bundle",
  "partner_program",
]);

const RECURRING_PRICE_IDS: Record<string, string> = {
  vip_bundle: Deno.env.get("STRIPE_PRICE_ID_VIP") || "",
  video_pin: Deno.env.get("STRIPE_PRICE_ID_VIDEO_PIN") || "",
  partner_program: Deno.env.get("STRIPE_PRICE_ID_PARTNER") || "",
  giant_monthly:
    Deno.env.get("STRIPE_PRICE_ID_GIANT_MONTHLY") ||
    Deno.env.get("STRIPE_PRICE_ID_GIANT") ||
    "",
};

// Satang (THB * 100)
const ONE_TIME_AMOUNTS: Record<string, number> = {
  verified: 19900,
  verified_1y: 19900,
  verified_life: 99900,
  glow_24h: 5000,
  glow_7d: 9900,
  glow_30d: 24900,
  boost_7d: 20000,
  standard_3d: 5900,
  standard_7d: 9900,
  standard_30d: 24900,
  giant_weekly: 100000,
  giant_monthly: 300000,
  video_pin: 150000,
  vip_bundle: 500000,
  partner_program: 89900,
};

const RequestSchema = z.object({
  venue_id: z.string().uuid().optional(),
  sku: z.string().min(1),
  purchase_mode: z.enum(["subscription", "one_time"]).optional(),
  payment_preferences: z
    .object({
      methodStrategy: z.enum(["dynamic", "explicit"]).optional(),
      method_strategy: z.enum(["dynamic", "explicit"]).optional(),
      allowInternational: z.boolean().optional(),
      allow_international: z.boolean().optional(),
      preferPromptPay: z.boolean().optional(),
      prefer_promptpay: z.boolean().optional(),
      bankCountry: z.string().optional(),
      bank_country: z.string().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  partner_ref: z.string().optional(),
  partner_code: z.string().optional(),
  visitor_id: z.string().optional(),
  return_url: z.string().optional(),
});

const toTitle = (sku: string) =>
  sku.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const resolveMode = (sku: string, requested?: "subscription" | "one_time") => {
  if (requested) return requested;
  return SUBSCRIPTION_DEFAULT_SKUS.has(sku) ? "subscription" : "one_time";
};

const sanitizePartnerToken = (value: string | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  return clean.slice(0, 64);
};

const createCheckoutIdempotencyKey = async ({
  userId,
  visitorId,
  venueId,
  sku,
  purchaseMode,
}: {
  userId: string;
  visitorId: string;
  venueId: string;
  sku: string;
  purchaseMode: string;
}) => {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000)); // 15-min retry window
  const raw = [
    "user",
    userId || "anon",
    "visitor",
    visitorId || "none",
    "venue",
    venueId || "none",
    "sku",
    sku,
    "mode",
    purchaseMode,
    "bucket",
    String(bucket),
  ].join("|");
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `checkout_${hex.slice(0, 48)}`;
};

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const resolvePartnerAttribution = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  {
    partnerCode,
    partnerRef,
  }: {
    partnerCode: string;
    partnerRef: string;
  },
) => {
  if (partnerCode) {
    const { data } = await supabaseAdmin
      .from("partners")
      .select("id, referral_code, status")
      .eq("referral_code", partnerCode.toUpperCase())
      .maybeSingle();
    if (
      data?.id &&
      String(data.status || "active").toLowerCase() === "active"
    ) {
      return {
        partnerId: String(data.id),
        partnerCode: String(data.referral_code || "").toUpperCase(),
      };
    }
  }

  if (partnerRef) {
    const query = supabaseAdmin
      .from("partners")
      .select("id, referral_code, status")
      .limit(1);
    const { data } = isUuidLike(partnerRef)
      ? await query.eq("id", partnerRef).maybeSingle()
      : await query.eq("referral_code", partnerRef.toUpperCase()).maybeSingle();
    if (
      data?.id &&
      String(data.status || "active").toLowerCase() === "active"
    ) {
      return {
        partnerId: String(data.id),
        partnerCode: String(data.referral_code || "").toUpperCase(),
      };
    }
  }

  return { partnerId: "", partnerCode: "" };
};

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const jsonHeaders = {
    ...buildCorsHeaders(origin),
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      return new Response("forbidden", {
        status: 403,
        headers: buildCorsHeaders(origin),
      });
    }
    return new Response("ok", {
      status: 200,
      headers: buildCorsHeaders(origin),
    });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
      },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("Missing STRIPE_SECRET_KEY");
      return new Response(
        JSON.stringify({ error: "Missing Stripe Server Config" }),
        {
          status: 500,
          headers: jsonHeaders,
        },
      );
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json();
    const parsed = RequestSchema.parse(body);
    const sku = parsed.sku.trim().toLowerCase();
    const purchaseMode = resolveMode(sku, parsed.purchase_mode);
    const paymentPreferences = parsed.payment_preferences || {};
    const methodStrategy = String(
      paymentPreferences.methodStrategy ||
        paymentPreferences.method_strategy ||
        "",
    )
      .trim()
      .toLowerCase();
    const allowInternational =
      paymentPreferences.allowInternational ??
      paymentPreferences.allow_international ??
      true;
    const preferPromptPay =
      paymentPreferences.preferPromptPay ??
      paymentPreferences.prefer_promptpay ??
      true;
    const bankCountry = String(
      paymentPreferences.bankCountry || paymentPreferences.bank_country || "TH",
    )
      .trim()
      .toUpperCase();
    const preferredCurrency = String(paymentPreferences.currency || "THB")
      .trim()
      .toUpperCase();
    const visitorId = (parsed.visitor_id || "").trim();
    const venueId = (parsed.venue_id || "").trim();
    if (!venueId && sku !== "partner_program") {
      return new Response(
        JSON.stringify({
          error: "venue_id is required for this sku",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }
    const userId = user?.id || null;
    const partnerCodeInput = sanitizePartnerToken(parsed.partner_code);
    const partnerRefInput = sanitizePartnerToken(parsed.partner_ref);
    const { partnerId, partnerCode } = await resolvePartnerAttribution(
      supabaseAdmin,
      {
        partnerCode: partnerCodeInput,
        partnerRef: partnerRefInput,
      },
    );

    const defaultReturnBase =
      sku === "partner_program"
        ? `${SITE_URL}/partner`
        : `${SITE_URL}/dashboard/billing`;
    const successBase = parsed.return_url || `${defaultReturnBase}/success`;
    const cancelBase = parsed.return_url || `${defaultReturnBase}/cancel`;

    const baseMetadata = {
      venue_id: venueId,
      sku,
      user_id: userId || "",
      visitor_id: visitorId,
      purchase_mode: purchaseMode,
      partner_id: partnerId,
      partner_code: partnerCode,
      payment_method_strategy: methodStrategy || "explicit",
      payment_country: bankCountry,
      payment_currency_preference: preferredCurrency,
      app: "vibecity",
    };

    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let mode: Stripe.Checkout.SessionCreateParams.Mode = "payment";
    let paymentMethodTypes:
      | Stripe.Checkout.SessionCreateParams.PaymentMethodType[]
      | undefined = ["card", "promptpay"];
    const useDynamicMethods =
      methodStrategy === "dynamic" ||
      (allowInternational && purchaseMode === "subscription");
    let subscriptionData:
      | Stripe.Checkout.SessionCreateParams.SubscriptionData
      | undefined = undefined;

    if (purchaseMode === "subscription") {
      const priceId = RECURRING_PRICE_IDS[sku] || "";
      if (!priceId) {
        return new Response(
          JSON.stringify({
            error: `Missing recurring price id for sku=${sku}`,
          }),
          { status: 400, headers: jsonHeaders },
        );
      }
      mode = "subscription";
      paymentMethodTypes = useDynamicMethods ? undefined : ["card"];
      lineItems = [{ price: priceId, quantity: 1 }];
      subscriptionData = {
        metadata: baseMetadata,
      };
    } else {
      const amount = ONE_TIME_AMOUNTS[sku];
      if (!Number.isFinite(amount) || amount <= 0) {
        return new Response(
          JSON.stringify({
            error: `Unsupported one-time sku=${sku}`,
          }),
          { status: 400, headers: jsonHeaders },
        );
      }
      lineItems = [
        {
          price_data: {
            currency: "thb",
            product_data: { name: `VibeCity: ${toTitle(sku)}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ];
      if (!preferPromptPay) {
        paymentMethodTypes = ["card"];
      }
    }

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: lineItems,
      metadata: baseMetadata,
      subscription_data: subscriptionData,
      success_url: `${successBase}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelBase}`,
    };
    if (Array.isArray(paymentMethodTypes) && paymentMethodTypes.length > 0) {
      sessionPayload.payment_method_types = paymentMethodTypes;
    }

    const idempotencyKey = await createCheckoutIdempotencyKey({
      userId: userId || "",
      visitorId,
      venueId,
      sku,
      purchaseMode,
    });
    const session = await stripe.checkout.sessions.create(sessionPayload, {
      idempotencyKey,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        mode,
        purchase_mode: purchaseMode,
      }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("[create-checkout-session] error", error?.message || error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
});
