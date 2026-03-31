import { WebhookHandler, WebhookPayload } from "../types.ts";

export class DatabaseHandler implements WebhookHandler {
  async handle(payload: WebhookPayload): Promise<void> {
    console.log(
      `[DatabaseHandler] Processing ${payload.type} on table ${payload.table}`,
    );

    if (payload.type === "INSERT" && payload.table === "events") {
      // Example: Log new event creation
      console.log(
        `[DatabaseHandler] New event created: ${payload.record?.name}`,
      );
    }

    if (payload.type === "UPDATE" && payload.table === "shops") {
      // Example: React to shop status change
      console.log(`[DatabaseHandler] Shop updated: ${payload.record?.name}`);
    }
  }
}
