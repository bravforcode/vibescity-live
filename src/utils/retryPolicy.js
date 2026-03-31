export const RETRY_POLICY = Object.freeze({
	tile: Object.freeze({ max: 2, backoff: "linear", baseMs: 1000 }),
	sprite: Object.freeze({ max: 3, backoff: "exponential", baseMs: 500 }),
	shopDetail: Object.freeze({ max: 2, backoff: "exponential", baseMs: 800 }),
	feed: Object.freeze({ max: 1, backoff: "exponential", baseMs: 250 }),
	events: Object.freeze({ max: 1, backoff: "exponential", baseMs: 300 }),
	localAds: Object.freeze({ max: 1, backoff: "linear", baseMs: 300 }),
	venueDiscovery: Object.freeze({
		max: 1,
		backoff: "exponential",
		baseMs: 300,
	}),
	venueEnrichment: Object.freeze({ max: 1, backoff: "linear", baseMs: 250 }),
	venueSearch: Object.freeze({ max: 1, backoff: "exponential", baseMs: 250 }),
	nearbyDiscovery: Object.freeze({ max: 1, backoff: "linear", baseMs: 250 }),
	featureFlags: Object.freeze({ max: 1, backoff: "exponential", baseMs: 300 }),
	gamificationStats: Object.freeze({
		max: 1,
		backoff: "linear",
		baseMs: 250,
	}),
	roomCounts: Object.freeze({ max: 1, backoff: "linear", baseMs: 250 }),
	favoritesRead: Object.freeze({ max: 1, backoff: "linear", baseMs: 250 }),
	userProfileRead: Object.freeze({ max: 1, backoff: "linear", baseMs: 250 }),
	osmDiscovery: Object.freeze({ max: 1, backoff: "exponential", baseMs: 400 }),
	adminApi: Object.freeze({ max: 2, backoff: "linear", baseMs: 350 }),
	adminRead: Object.freeze({ max: 1, backoff: "linear", baseMs: 300 }),
	rum: Object.freeze({
		max: 0,
		backoff: "none",
		baseMs: 0,
		circuitBreaker: true,
	}),
});

export const getRetryPolicy = (resourceType = "") =>
	RETRY_POLICY[String(resourceType || "").trim()] || {
		max: 0,
		backoff: "none",
		baseMs: 0,
	};

export const computeBackoffDelayMs = ({
	resourceType = "",
	attempt = 0,
} = {}) => {
	const policy = getRetryPolicy(resourceType);
	if (!Number.isFinite(policy.baseMs) || policy.baseMs <= 0) return 0;
	const safeAttempt = Math.max(0, Number(attempt || 0));
	if (policy.backoff === "exponential") {
		return Math.round(policy.baseMs * 2 ** safeAttempt);
	}
	return Math.round(policy.baseMs * (safeAttempt + 1));
};

export const shouldRetryResource = ({
	resourceType = "",
	attempt = 0,
} = {}) => {
	const policy = getRetryPolicy(resourceType);
	const safeAttempt = Math.max(0, Number(attempt || 0));
	return safeAttempt < Number(policy.max || 0);
};

export const waitForBackoff = (delayMs) =>
	new Promise((resolve) => {
		const ms = Math.max(0, Number(delayMs || 0));
		setTimeout(resolve, ms);
	});

/**
 * Enterprise Retry Policy with Exponential Backoff and Jitter
 */
export const withRetry = async (
	fn,
	{
		maxRetries = 3,
		baseDelayMs = 1000,
		maxDelayMs = 10000,
		shouldRetry = (err) => !err.status || err.status >= 500,
	} = {},
) => {
	let lastError;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt === maxRetries || !shouldRetry(error)) {
				throw error;
			}

			// Exponential backoff: base * 2^attempt
			const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
			// Add jitter: ±20%
			const jitter = delay * 0.2 * (Math.random() * 2 - 1);
			const finalDelay = Math.max(0, delay + jitter);

			console.warn(
				`[Retry] Attempt ${attempt + 1} failed. Retrying in ${Math.round(finalDelay)}ms...`,
				error,
			);
			await new Promise((resolve) => setTimeout(resolve, finalDelay));
		}
	}
	throw lastError;
};

// ✅ CIRCUIT BREAKER IMPLEMENTATION
// Simple circuit breaker for resources with circuitBreaker=true flag
// Opens after 3 consecutive failures, half-opens after 60s to retry

const _circuitState = new Map(); // resourceType → { failures, openedAt }
const FAILURE_THRESHOLD = 3;
const HALF_OPEN_WINDOW_MS = 60000; // 60 seconds

export const isCircuitOpen = (resourceType = "") => {
	const state = _circuitState.get(resourceType);
	if (!state) return false;

	const now = Date.now();
	if (now - state.openedAt > HALF_OPEN_WINDOW_MS) {
		// Half-open: reset and allow retry
		_circuitState.delete(resourceType);
		return false;
	}
	return state.failures >= FAILURE_THRESHOLD;
};

export const recordFailure = (resourceType = "") => {
	const state = _circuitState.get(resourceType);
	if (state) {
		state.failures += 1;
	} else {
		_circuitState.set(resourceType, { failures: 1, openedAt: Date.now() });
	}
};

export const recordSuccess = (resourceType = "") => {
	_circuitState.delete(resourceType);
};
