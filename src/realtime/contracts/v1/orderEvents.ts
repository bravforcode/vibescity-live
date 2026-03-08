export type OrderEventType =
	| "order.created"
	| "order.updated"
	| "stream.ready"
	| "payout.pending"
	| "payout.success"
	| "payout.failed";

export interface OrderEventV1 {
	_version: 1;
	type: OrderEventType;
	orderId?: string;
	payoutId?: string;
	amount?: number;
	timestamp: string;
	idempotencyKey?: string;
}

export const isOrderEventV1 = (value: unknown): value is OrderEventV1 => {
	if (!value || typeof value !== "object") return false;
	const payload = value as Record<string, unknown>;
	return (
		payload._version === 1 &&
		typeof payload.type === "string" &&
		typeof payload.timestamp === "string"
	);
};

export const parseOrderEvent = (value: unknown): OrderEventV1 | null => {
	if (!isOrderEventV1(value)) return null;
	return value;
};
