import {
	isTransientNetworkError,
	logUnexpectedNetworkError,
} from "./networkErrorUtils";
import {
	computeBackoffDelayMs,
	shouldRetryResource,
	waitForBackoff,
} from "./retryPolicy";

export const isSoftNetworkReadError = (error) => isTransientNetworkError(error);

export const runNetworkReadPolicy = async ({
	resourceType,
	run,
	shouldRetryError = isSoftNetworkReadError,
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

export const logUnexpectedNetworkReadError = (message, error, options = {}) => {
	if (isSoftNetworkReadError(error)) return false;
	return logUnexpectedNetworkError(message, error, options);
};
