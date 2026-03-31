import { WebhookHandler, WebhookPayload } from "../types.ts";

export class PaymentHandler implements WebhookHandler {
  async handle(payload: WebhookPayload): Promise<void> {
    console.log(`[PaymentHandler] Processing payment event: ${payload.type}`);

    const { data } = payload;

    if (payload.type === "payment.success") {
      // Example: Grant user premium access
      console.log(
        `[PaymentHandler] Payment successful for amount: ${data?.amount}`,
      );
    } else if (payload.type === "payment.failed") {
      // Example: Send email notification
      console.log(`[PaymentHandler] Payment failed: ${data?.reason}`);
    }
  }
}
