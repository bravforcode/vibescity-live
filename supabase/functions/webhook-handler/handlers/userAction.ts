import { EventType, WebhookPayload } from "../types.ts";

export class UserActionHandler {
  async handle(payload: WebhookPayload): Promise<void> {
    const { type, data } = payload;
    console.log(`[UserAction] Processing ${type} for user: ${data?.user_id}`);

    switch (type) {
      case EventType.USER_REGISTER:
        await this.handleRegister(data);
        break;
      case EventType.USER_LIKE:
        await this.handleLike(data);
        break;
      // Add more as needed
    }
  }

  private async handleRegister(data: any) {
    // Logic: Give welcome XP, Create default profile settings
    console.log(`[UserAction] Welcome new user! ID: ${data?.id}`);
    // Example: await supabase.from('profiles').update({ xp: 100 }).eq('id', data.id)
  }

  private async handleLike(data: any) {
    // Logic: Record like, Notify shop owner?
    console.log(`[UserAction] User liked shop: ${data?.shop_id}`);
  }
}
