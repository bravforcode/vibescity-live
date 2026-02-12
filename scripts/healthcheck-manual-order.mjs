#!/usr/bin/env node
import "dotenv/config";

const {
  MANUAL_ORDER_HEALTHCHECK_API_URL,
  MANUAL_ORDER_HEALTHCHECK_SLIP_URL,
  MANUAL_ORDER_HEALTHCHECK_AMOUNT,
  MANUAL_ORDER_HEALTHCHECK_SKU,
  MANUAL_ORDER_HEALTHCHECK_VENUE_ID,
  MANUAL_ORDER_HEALTHCHECK_VISITOR_ID,
  MANUAL_ORDER_HEALTHCHECK_CONFIRM,
} = process.env;

if (MANUAL_ORDER_HEALTHCHECK_CONFIRM !== "YES") {
  console.error(
    "Set MANUAL_ORDER_HEALTHCHECK_CONFIRM=YES to run (this creates a real order).",
  );
  process.exit(1);
}

if (!MANUAL_ORDER_HEALTHCHECK_API_URL) {
  console.error("Missing MANUAL_ORDER_HEALTHCHECK_API_URL");
  process.exit(1);
}

if (!MANUAL_ORDER_HEALTHCHECK_SLIP_URL) {
  console.error("Missing MANUAL_ORDER_HEALTHCHECK_SLIP_URL");
  process.exit(1);
}

if (!MANUAL_ORDER_HEALTHCHECK_AMOUNT) {
  console.error("Missing MANUAL_ORDER_HEALTHCHECK_AMOUNT");
  process.exit(1);
}

if (!MANUAL_ORDER_HEALTHCHECK_SKU) {
  console.error("Missing MANUAL_ORDER_HEALTHCHECK_SKU");
  process.exit(1);
}

const apiBase = MANUAL_ORDER_HEALTHCHECK_API_URL.replace(/\/+$/, "");
const endpoint = `${apiBase}/api/v1/payments/manual-order`;

const payload = {
  venue_id: MANUAL_ORDER_HEALTHCHECK_VENUE_ID || null,
  sku: MANUAL_ORDER_HEALTHCHECK_SKU,
  amount: Number(MANUAL_ORDER_HEALTHCHECK_AMOUNT),
  slip_url: MANUAL_ORDER_HEALTHCHECK_SLIP_URL,
  visitor_id: MANUAL_ORDER_HEALTHCHECK_VISITOR_ID || "healthcheck-bot",
  metadata: {
    healthcheck: true,
  },
  consent_personal_data: true,
  buyer_profile: {
    full_name: "Healthcheck Bot",
    phone: "0800000000",
    email: "healthcheck@vibecity.live",
    address_line1: "Healthcheck Street",
    address_line2: "",
    country: "TH",
    province: "Bangkok",
    district: "Pathum Wan",
    postal_code: "10330",
  },
};

async function run() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Healthcheck failed (${res.status})`);
    console.error(text);
    process.exit(1);
  }

  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw text
  }

  console.log("✅ Manual order healthcheck succeeded");
  console.log(data);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
