import { useThrottleFn } from "@vueuse/core";

export type ThrottledHandler<TArgs extends unknown[]> = (
	...args: TArgs
) => void;

export type ActionHandler<TArgs extends unknown[]> = (
	...args: TArgs
) => void | Promise<void>;

export interface ThrottleOptions {
	delayMs?: number;
}

const DEFAULT_DELAY_MS = 1_000;

export const useThrottledAction = (options: ThrottleOptions = {}) => {
	const delayMs =
		typeof options.delayMs === "number" && options.delayMs > 0
			? options.delayMs
			: DEFAULT_DELAY_MS;

	const createThrottledAction = <TArgs extends unknown[]>(
		handler: ActionHandler<TArgs>,
	): ThrottledHandler<TArgs> =>
		useThrottleFn(
			(...args: TArgs) => {
				void handler(...args);
			},
			delayMs,
			false,
			true,
		);

	return {
		createThrottledAction,
	};
};
