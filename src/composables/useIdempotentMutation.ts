import { ref } from "vue";
import { createIdempotencyKey } from "@/utils/idempotencyKey";

type MutationRunner<TPayload, TResult> = (
	payload: TPayload,
	idempotencyKey: string,
) => Promise<TResult>;

export function useIdempotentMutation<TPayload = unknown, TResult = unknown>(
	scope = "mutation",
) {
	const inFlight = ref(new Map<string, Promise<TResult>>());

	const mutate = async (
		endpoint: string,
		payload: TPayload,
		runner: MutationRunner<TPayload, TResult>,
	): Promise<TResult> => {
		const key = createIdempotencyKey(endpoint, payload, scope);
		const existing = inFlight.value.get(key);
		if (existing) return existing;

		const task = runner(payload, key).finally(() => {
			inFlight.value.delete(key);
		});

		inFlight.value.set(key, task);
		return task;
	};

	return { mutate, inFlight };
}
