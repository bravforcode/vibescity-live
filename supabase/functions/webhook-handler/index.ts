import { AnalyticsHandler } from "./handlers/analytics.ts";
import { DatabaseHandler } from "./handlers/database.ts";
import { PaymentHandler } from "./handlers/payment.ts";
import { UserActionHandler } from "./handlers/userAction.ts";
import { EventType, WebhookPayload } from "./types.ts";

// Cache the secret to avoid repeated env lookups
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

// Pre-instantiate handlers if they are stateless (Singleton pattern) for better perf
const dbHandler = new DatabaseHandler();
const paymentHandler = new PaymentHandler();
const userActionHandler = new UserActionHandler();
const analyticsHandler = new AnalyticsHandler();

console.log("🚀 Webhook Dispatcher (High Performance) Ready!");

Deno.serve(async (req: Request): Promise<Response> => {
  // 1. FAST PATH: Method check
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. FAST PATH: Security Check (Fail fast before JSON parsing)
  // Check headers first as it's cheaper than URL parsing
  const secretHeader = req.headers.get("x-webhook-secret");

  if (WEBHOOK_SECRET) {
    // Priority: Header -> Query Param (Lazy URL parsing only if header fails)
    if (secretHeader !== WEBHOOK_SECRET) {
      const url = new URL(req.url);
      if (url.searchParams.get("secret") !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }

  try {
    // 3. Parse JSON (Most expensive operation, done only after security pass)
    const payload: WebhookPayload = await req.json();

    // 4. Dispatch Strategy
    switch (payload.type) {
      case EventType.INSERT:
      case EventType.UPDATE:
      case EventType.DELETE:
        // Run async without awaiting if you want fire-and-forget (faster response),
        // OR await if reliability > latency. Here we await to ensure completion.
        await dbHandler.handle(payload);
        break;

      case EventType.PAYMENT_SUCCESS:
      case EventType.PAYMENT_FAILED:
        await paymentHandler.handle(payload);
        break;

      case EventType.USER_REGISTER:
      case EventType.USER_LOGIN:
      case EventType.USER_LIKE:
      case EventType.USER_REVIEW:
        await userActionHandler.handle(payload);
        break;

      case EventType.TRACK_VIEW:
      case EventType.TRACK_CLICK:
        await analyticsHandler.handle(payload);
        break;

      case EventType.TEST_EVENT:
        console.log("[Dispatcher] Test event received!");
        break;
      default:
        console.warn(`[Dispatcher] Unhandled event type: ${payload.type}`);
    }

    return new Response(
      JSON.stringify({ message: "Ack", type: payload.type }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[Dispatcher] Error:", error);
    return new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
