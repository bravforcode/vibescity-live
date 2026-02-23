import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detectTextFromImage,
  fetchSlipBytes,
  sha256Hex,
  sha256HexString,
} from "./gcv.ts";
import { evaluateSlipText } from "./slip-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SLIP_EXPECT_RECEIVER_NAME =
  Deno.env.get("SLIP_EXPECT_RECEIVER_NAME") || "";
const SLIP_EXPECT_RECEIVER_BANKS_RAW =
  Deno.env.get("SLIP_EXPECT_RECEIVER_BANKS") ||
  Deno.env.get("SLIP_EXPECT_RECEIVER_BANK") ||
  "";
const SLIP_EXPECT_RECEIVER_ACCOUNT =
  Deno.env.get("SLIP_EXPECT_RECEIVER_ACCOUNT") || "";
const SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL = Number(
  Deno.env.get("SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL") || "4",
);
const SLIP_DISABLE_MANUAL_REVIEW =
  (Deno.env.get("SLIP_DISABLE_MANUAL_REVIEW") || "false").toLowerCase() ===
  "true";
const SLIP_DUPLICATE_WINDOW_DAYS = Number(
  Deno.env.get("SLIP_DUPLICATE_WINDOW_DAYS") || "90",
);
const SLIP_STORE_OCR_RAW =
  (Deno.env.get("SLIP_STORE_OCR_RAW") || "false").toLowerCase() === "true";
const GCV_OCR_MAX_BYTES = Number(
  Deno.env.get("GCV_OCR_MAX_BYTES") || "5242880",
);
const IPINFO_TOKEN = Deno.env.get("IPINFO_TOKEN") || "";

const normalizeText = (value: string) =>
  (value || "").trim().replace(/\s+/g, " ").toLowerCase();

const normalizeList = (value: string) =>
  value
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);

const getFeatureFromSku = (sku: string) => {
  const safeSku = (sku || "").toLowerCase();
  if (safeSku.startsWith("glow")) return "glow";
  if (safeSku.startsWith("boost")) return "boost";
  if (safeSku.startsWith("giant")) return "giant";
  return "verified";
};

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

const extractIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const candidate = forwarded || realIp;
  if (!candidate) return "";
  return candidate.split(",")[0].trim();
};

const hashIp = async (ip: string) => {
  if (!ip) return "";
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const fetchIpInfo = async (ip: string) => {
  if (!ip || !IPINFO_TOKEN) return null;
  const resp = await fetch(
    `https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`,
  );
  if (!resp.ok) return null;
  return await resp.json();
};

const formatDiscordSummary = (lines: Array<string>) => {
  return ["```", ...lines.filter(Boolean), "```"].join("\n");
};

type SlipVerification = {
  status: "verified" | "rejected" | "pending_review" | "error";
  reason: string;
  provider: string;
  data: {
    amount?: number | null;
    transRef?: string;
    transDate?: string | null;
    receiver?: unknown;
    sender?: unknown;
  };
  score?: number;
  signals?: Record<string, unknown>;
  image_hash?: string;
  text_hash?: string;
  ocr_text?: string;
  raw?: unknown;
  error?: string;
};

const verifySlipWithGcv = async (slipUrl: string, amount: number) => {
  const imageBytes = await fetchSlipBytes(slipUrl, GCV_OCR_MAX_BYTES);
  const imageHash = await sha256Hex(imageBytes);
  const { text, raw } = await detectTextFromImage(imageBytes);

  const expectedBanks = normalizeList(SLIP_EXPECT_RECEIVER_BANKS_RAW);
  const evaluation = evaluateSlipText({
    text,
    expectedAmount: amount,
    expectedReceiverName: SLIP_EXPECT_RECEIVER_NAME,
    expectedReceiverBanks: expectedBanks,
    expectedReceiverAccount: SLIP_EXPECT_RECEIVER_ACCOUNT,
    expectedReceiverAccountTail: SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL,
  });

  const textHash = await sha256HexString(evaluation.normalizedText);

  return {
    status: evaluation.status,
    reason: evaluation.reason,
    provider: "gcv",
    score: evaluation.score,
    signals: evaluation.signals,
    data: {
      amount: evaluation.amount ?? null,
      transRef: "",
      transDate: evaluation.timestamp || null,
      receiver: evaluation.receiver,
      sender: {},
    },
    raw,
    ocr_text: text,
    image_hash: imageHash,
    text_hash: textHash,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const {
      venue_id,
      sku,
      amount,
      slip_url,
      visitor_id,
      metadata,
      consent_personal_data,
      buyer_profile,
    } = body || {};

    if (!consent_personal_data) {
      return new Response(JSON.stringify({ error: "Consent required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buyerProfile = buyer_profile || {};
    const requiredProfileFields = [
      "full_name",
      "phone",
      "email",
      "address_line1",
      "country",
      "province",
      "district",
      "postal_code",
    ];
    const missingProfile = requiredProfileFields.filter(
      (key) => !buyerProfile?.[key],
    );
    if (missingProfile.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Missing buyer_profile fields: ${missingProfile.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const amountValue = Number(amount) || 0;
    const ipAddress = extractIp(req);
    const userAgent = req.headers.get("user-agent") || "";
    const ipHash = await hashIp(ipAddress);
    const ipInfo = await fetchIpInfo(ipAddress);

    const initialStatus = SLIP_DISABLE_MANUAL_REVIEW
      ? "pending"
      : "pending_review";

    // 1. Create Order in DB
    const { data: order, error: dbError } = await supabase
      .from("orders")
      .insert({
        venue_id,
        visitor_id,
        sku,
        amount: amountValue,
        payment_method: "manual_transfer",
        status: initialStatus,
        slip_url,
        metadata,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    const slipAuditPayload = {
      order_id: order.id,
      user_id: order.user_id || null,
      visitor_id: visitor_id || null,
      consent_personal_data: true,
      buyer_full_name: buyerProfile.full_name,
      buyer_phone: buyerProfile.phone,
      buyer_email: buyerProfile.email,
      buyer_address_line1: buyerProfile.address_line1,
      buyer_address_line2: buyerProfile.address_line2 || null,
      buyer_country: buyerProfile.country,
      buyer_province: buyerProfile.province,
      buyer_district: buyerProfile.district,
      buyer_postal: buyerProfile.postal_code,
      ip_address: ipAddress || null,
      ip_hash: ipHash || null,
      user_agent: userAgent || null,
      geo_country: ipInfo?.country || buyerProfile.country || null,
      geo_region: ipInfo?.region || buyerProfile.province || null,
      geo_city: ipInfo?.city || buyerProfile.district || null,
      geo_postal: ipInfo?.postal || buyerProfile.postal_code || null,
      geo_timezone: ipInfo?.timezone || null,
      geo_loc: ipInfo?.loc || null,
      geo_org: ipInfo?.org || null,
    };

    const { error: slipAuditError } = await supabase
      .from("slip_audit")
      .insert(slipAuditPayload);

    if (slipAuditError) {
      console.error("Slip audit insert failed:", slipAuditError.message);
    }

    // 2. Discord Notification (Replacing LINE Notify)
    // NOTE: Never hardcode webhook URLs. Configure DISCORD_WEBHOOK_URL via Supabase secrets.
    const discordUrl = Deno.env.get("DISCORD_WEBHOOK_URL") || "";

    if (discordUrl) {
      await sendDiscord(discordUrl, {
        username: "VibeCity Order Bot",
        avatar_url: "https://vibecity.live/logo.png", // Ensure this logo exists or remove
        embeds: [
          {
            title: "💰 New Manual Payment Received!",
            description: `A new transfer has been submitted for verification.`,
            color: 5814783, // #58b9ff (Nice Blue)
            fields: [
              {
                name: "📦 Package",
                value: sku.toUpperCase(),
                inline: true,
              },
              {
                name: "💸 Amount",
                value: `฿${amountValue.toLocaleString()}`,
                inline: true,
              },
              {
                name: "🏪 Venue ID",
                value: `${venue_id}`, // Wrap in code block for copy-paste if preferred -> \`${venue_id}\`
                inline: false,
              },
              {
                name: "🧾 Order Metadata",
                value: metadata ? JSON.stringify(metadata) : "N/A",
                inline: false,
              },
            ],
            image: {
              url: slip_url, // ✅ Show the full slip image in the chat
            },
            timestamp: new Date().toISOString(),
            footer: {
              text: `Visitor: ${visitor_id || "Anonymous"}`,
            },
          },
        ],
      });
    }

    // 3. Auto-Verify Slip (Google Cloud Vision OCR)
    let verification: SlipVerification = {
      status: "error",
      reason: "ocr_failed",
      provider: "gcv",
      data: {},
      score: 0,
      signals: {},
      image_hash: "",
      text_hash: "",
      ocr_text: "",
    };

    try {
      verification = await verifySlipWithGcv(slip_url, amountValue);
    } catch (error) {
      verification = {
        status: "error",
        reason: "ocr_failed",
        provider: "gcv",
        data: {},
        score: 0,
        signals: {},
        image_hash: "",
        text_hash: "",
        ocr_text: "",
        error: error.message,
      };
    }

    const manualReviewDisabled = SLIP_DISABLE_MANUAL_REVIEW;
    let finalStatus = order.status || initialStatus;
    let entitlementApplied = false;
    let verificationReason = verification.reason || "";

    const imageHash = verification.image_hash as string;
    const textHash = verification.text_hash as string;
    const duplicateWindowStart = new Date(
      Date.now() - SLIP_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    if (imageHash) {
      const { data: duplicates } = await supabase
        .from("orders")
        .select("id")
        .contains("metadata", { slip_image_hash: imageHash })
        .gte("created_at", duplicateWindowStart)
        .neq("id", order.id)
        .limit(1);

      if (duplicates && duplicates.length > 0) {
        verification.status = "rejected";
        verificationReason = "duplicate_slip";
      }
    }

    if (textHash) {
      const { data: duplicates } = await supabase
        .from("orders")
        .select("id")
        .contains("metadata", { slip_text_hash: textHash })
        .gte("created_at", duplicateWindowStart)
        .neq("id", order.id)
        .limit(1);

      if (duplicates && duplicates.length > 0) {
        verification.status = "rejected";
        verificationReason = "duplicate_slip";
      }
    }

    if (verification.status === "verified") {
      const feature = getFeatureFromSku(sku);

      // Calculate Duration
      const startsAt = new Date();
      let endsAt: Date | null = new Date();

      if (sku.includes("3d")) {
        endsAt.setDate(startsAt.getDate() + 3);
      } else if (sku.includes("7d") || sku.includes("weekly")) {
        endsAt.setDate(startsAt.getDate() + 7);
      } else if (sku.includes("monthly") || sku.includes("30d")) {
        endsAt.setDate(startsAt.getDate() + 30);
      } else if (sku === "verified") {
        endsAt.setFullYear(startsAt.getFullYear() + 1); // 1 Year
      } else if (sku.includes("lifetime")) {
        endsAt.setFullYear(startsAt.getFullYear() + 99); // 99 Years
      } else {
        endsAt.setDate(startsAt.getDate() + 1); // Default 1 day
      }

      if (venue_id) {
        const { error: rpcError } = await supabase.rpc("apply_entitlement", {
          p_user_id: null,
          p_venue_id: venue_id,
          p_order_id: order.id,
          p_feature: feature,
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
        });

        if (rpcError) {
          verification.status = "error";
          verificationReason = `entitlement_error: ${rpcError.message}`;
        } else {
          entitlementApplied = true;
        }
      } else {
        entitlementApplied = true;
      }
    }

    if (verification.status === "verified" && entitlementApplied) {
      finalStatus = "paid";
    } else if (verification.status === "rejected") {
      finalStatus = "rejected";
    } else if (manualReviewDisabled) {
      finalStatus = "rejected";
      if (!verificationReason) {
        verificationReason =
          verification.status === "skipped"
            ? "verification_skipped"
            : "verification_error";
      }
    } else {
      finalStatus = "pending_review";
    }

    const verificationMeta = {
      provider: verification.provider,
      status: verification.status,
      reason: verificationReason,
      checked_at: new Date().toISOString(),
      amount: verification.data?.amount ?? null,
      trans_ref: verification.data?.transRef ?? null,
      trans_date: verification.data?.transDate ?? null,
      receiver: verification.data?.receiver ?? null,
      sender: verification.data?.sender ?? null,
      manual_review_disabled: manualReviewDisabled,
      score: verification.score ?? null,
      signals: verification.signals ?? null,
    };

    const mergedMetadata = {
      ...(order.metadata || {}),
      slip_trans_ref: verification.data?.transRef ?? undefined,
      slip_image_hash: imageHash || undefined,
      slip_text_hash: textHash || undefined,
      slip_ocr_raw: SLIP_STORE_OCR_RAW ? verification.ocr_text : undefined,
      slip_verification: verificationMeta,
      slip_decision: {
        final_status: finalStatus,
        auto_review: manualReviewDisabled,
      },
      pii_consent: true,
    };

    await supabase
      .from("orders")
      .update({
        status: finalStatus,
        metadata: mergedMetadata,
        updated_at: new Date(),
      })
      .eq("id", order.id);

    if (order) {
      order.status = finalStatus;
      order.metadata = mergedMetadata;
      order.updated_at = new Date().toISOString();
    }

    if (discordUrl) {
      const color =
        finalStatus === "paid"
          ? 5763719 // green
          : finalStatus === "rejected"
            ? 15548997 // red
            : 16763904; // yellow

      await sendDiscord(discordUrl, {
        username: "VibeCity Order Bot",
        avatar_url: "https://vibecity.live/logo.png",
        embeds: [
          {
            title: "🧾 Slip Verification Result",
            description: `Order ${order.id} → ${finalStatus.toUpperCase()}`,
            color,
            fields: [
              {
                name: "✅ Verification",
                value: `${verification.status || "unknown"}${
                  verificationReason ? ` (${verificationReason})` : ""
                }`,
                inline: false,
              },
              {
                name: "💸 Amount",
                value: `฿${amountValue.toLocaleString()}`,
                inline: true,
              },
              {
                name: "🔎 Trans Ref",
                value: `${verification.data?.transRef || "N/A"}`,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      if (finalStatus === "rejected") {
        const summaryLines = [
          `From: ${verification.data?.sender?.name || "N/A"} (${
            verification.data?.sender?.bank || "N/A"
          })`,
          `Amount: ฿${amountValue.toLocaleString()} | Ref: ${
            verification.data?.transRef || "N/A"
          } | Time: ${verification.data?.transDate || "N/A"}`,
          `Country: ${slipAuditPayload.geo_country || "N/A"} | Province: ${
            slipAuditPayload.geo_region || "N/A"
          } | District: ${slipAuditPayload.geo_city || "N/A"} | Postal: ${
            slipAuditPayload.geo_postal || "N/A"
          }`,
          `Buyer: ${buyerProfile.full_name} | ${buyerProfile.phone} | ${
            buyerProfile.email
          }`,
          `Address: ${buyerProfile.address_line1}${
            buyerProfile.address_line2 ? ` ${buyerProfile.address_line2}` : ""
          }`,
          `IP: ${ipAddress || "N/A"} | UA: ${userAgent || "N/A"}`,
        ];

        await sendDiscord(discordUrl, {
          username: "VibeCity Order Bot",
          avatar_url: "https://vibecity.live/logo.png",
          embeds: [
            {
              title: "🚫 Slip Rejected",
              description: formatDiscordSummary(summaryLines),
              color: 15548997,
              image: slip_url ? { url: slip_url } : undefined,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }
    }

    return new Response(JSON.stringify({ success: true, order }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
