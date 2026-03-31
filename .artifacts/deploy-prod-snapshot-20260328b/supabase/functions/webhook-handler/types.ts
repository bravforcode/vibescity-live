export interface WebhookPayload<T = any> {
  type: string;
  table?: string;
  schema?: string;
  record?: T;
  old_record?: T;
  data?: T;
  timestamp?: string;
}

export enum EventType {
  // Database Events (Supabase)
  INSERT = "INSERT",
  UPDATE = "UPDATE",
  DELETE = "DELETE",

  // Payment
  PAYMENT_SUCCESS = "payment.success",
  PAYMENT_FAILED = "payment.failed",

  // User Actions
  USER_REGISTER = "USER_REGISTER",
  USER_LOGIN = "USER_LOGIN",
  USER_LIKE = "USER_LIKE",
  USER_REVIEW = "USER_REVIEW",

  // Analytics
  TRACK_VIEW = "TRACK_VIEW",
  TRACK_CLICK = "TRACK_CLICK",

  // System
  SYSTEM_ALERT = "SYSTEM_ALERT",
  TEST_EVENT = "test_event",
}

export interface WebhookHandler {
  handle(payload: WebhookPayload): Promise<void>;
}
