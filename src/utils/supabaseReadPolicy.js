import { isSupabaseSchemaCacheError } from "../lib/supabase";
import {
	isTransientNetworkError,
	logUnexpectedNetworkError,
} from "./networkErrorUtils";
import {
	computeBackoffDelayMs,
	shouldRetryResource,
	waitForBackoff,
} from "./retryPolicy";

export const isSoftSupabaseReadError = (error) =>
	isSupabaseSchemaCacheError(error) || isTransientNetworkError(error);

export const runSupabaseReadPolicy = async ({
	resourceType,
	run,
	shouldRetryError = isSoftSupabaseReadError,
}) => {
	let attempt = 0;

	while (true) {
		try {
			return await run(attempt);
		} catch (error) {
			if (
				shouldRetryError(error) &&
				shouldRetryResource({ resourceType, attempt })
			) {
				await waitForBackoff(computeBackoffDelayMs({ resourceType, attempt }));
				attempt += 1;
				continue;
			}
			throw error;
		}
	}
};

export const logUnexpectedSupabaseReadError = (
	message,
	error,
	options = {},
) => {
	if (isSoftSupabaseReadError(error)) return false;
	return logUnexpectedNetworkError(message, error, options);
};
