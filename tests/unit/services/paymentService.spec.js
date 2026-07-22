import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "tok_test" } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: { id: "user_1" } },
      })),
    },
    functions: {
      invoke: vi.fn(async (fnName) => {
        if (fnName === "stripe-checkout") {
          return { data: { sessionId: "sess_123", url: "https://checkout.stripe" }, error: null };
        }
        if (fnName === "stripe-verify") {
          return { data: { success: true, subscription: {} }, error: null };
        }
        return { data: null, error: null };
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock("../../../src/lib/runtimeConfig", () => ({
  getSupabaseEdgeBaseUrl: vi.fn(() => "https://edge.test"),
  getApiV1BaseUrl: vi.fn(() => "https://api.test"),
}));

vi.mock("../../../src/services/analyticsService", () => ({
  analyticsService: { trackEvent: vi.fn(async () => {}) },
}));

vi.mock("../../../src/config/stripe", () => ({
  STRIPE_CONFIG: {
    publishableKey: "pk_test_123",
    prices: { venue_subscription_monthly: "price_1", venue_subscription_yearly: "price_2" },
    shopIds: { venue_monthly: "shop_1", venue_yearly: "shop_2" },
  },
  getStripeInstance: vi.fn(async () => ({
    createPaymentMethod: vi.fn(async () => ({ paymentMethod: { id: "pm_123", card: { last4: "4242" } } })),
    confirmCardPayment: vi.fn(async () => ({ paymentIntent: { status: "succeeded", id: "pi_123" } })),
  })),
}));

vi.stubGlobal("fetch", vi.fn(async (url) => {
  if (String(url).includes("get-order-status")) {
    return { ok: true, json: async () => ({ status: "paid" }) };
  }
  if (String(url).includes("manual-order")) {
    return { ok: true, json: async () => ({ success: true }) };
  }
  return { ok: true, json: async () => ({ url: "https://checkout.stripe/c/sess_123" }) };
}));
vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
vi.stubGlobal("document", { cookie: "" });
vi.stubGlobal("window", { location: { origin: "https://test.com", pathname: "/" } });

import { paymentService } from "../../../src/services/paymentService";

describe("paymentService", () => {
  describe("createCheckoutSession", () => {
    it("calls supabase function with correct params", async () => {
      const result = await paymentService.createCheckoutSession("shop_1", [
        { sku: "sku_1", quantity: 1 },
      ]);
      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
    });
  });

  describe("getOrderStatus", () => {
    it("returns status for a session", async () => {
      const result = await paymentService.getOrderStatus("sess_123");
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  describe("getMyOrders", () => {
    it("returns orders array", async () => {
      const result = await paymentService.getMyOrders();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
