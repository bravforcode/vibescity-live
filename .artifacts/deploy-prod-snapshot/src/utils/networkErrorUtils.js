const ABORT_MESSAGE_FRAGMENTS = [
	"aborterror",
	"signal is aborted",
	"the operation was aborted",
	"operation was aborted",
	"request was aborted",
	"request aborted",
	"user aborted",
];

const NETWORK_ABORT_NAMES = new Set(["AbortError"]);
const SIGNAL_ABORT_FALLBACK_NAMES = new Set(["NetworkError"]);
const TRANSIENT_NETWORK_STATUS_CODES = new Set([
	408, 425, 429, 500, 502, 503, 504,
]);
const TRANSIENT_MESSAGE_FRAGMENTS = [
	"schema cache",
	"upstream request timeout",
	"service unavailable",
	"temporarily unavailable",
	"network error",
	"failed to fetch",
	"gateway timeout",
	"timed out",
	"timeout",
	"network offline",
	"queued or deferred",
	"offline",
];

const toMessage = (value) => String(value || "").toLowerCase();

const getErrorChain = (errorLike) => {
	const chain = [];
	const seen = new Set();
	let current = errorLike;

	while (current && !seen.has(current)) {
		chain.push(current);
		seen.add(current);
		current = current?.cause;
	}

	return chain;
};

const isAbortMessage = (errorLike) => {
	const message = toMessage(errorLike?.message || errorLike);
	return ABORT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
};

const isTransientMessage = (errorLike) => {
	const message = toMessage(errorLike?.message || errorLike);
	return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) =>
		message.includes(fragment),
	);
};

const toFiniteCode = (value) => {
	const code = Number(value);
	return Number.isFinite(code) ? code : null;
};

export const isAbortLikeError = (errorLike) =>
	getErrorChain(errorLike).some((entry) => {
		const name = String(entry?.name || "");
		return NETWORK_ABORT_NAMES.has(name) || isAbortMessage(entry);
	});

export const isExpectedAbortError = (errorLike, options = {}) => {
	if (isAbortLikeError(errorLike)) return true;

	if (!options?.signal?.aborted) return false;

	return getErrorChain(errorLike).some((entry) => {
		const name = String(entry?.name || "");
		return SIGNAL_ABORT_FALLBACK_NAMES.has(name);
	});
};

export const isTransientNetworkError = (errorLike) => {
	if (isAbortLikeError(errorLike)) return false;

	return getErrorChain(errorLike).some((entry) => {
		const status = toFiniteCode(entry?.status);
		if (status !== null && TRANSIENT_NETWORK_STATUS_CODES.has(status)) {
			return true;
		}

		const code = toFiniteCode(entry?.code);
		if (code !== null && TRANSIENT_NETWORK_STATUS_CODES.has(code)) {
			return true;
		}

		return isTransientMessage(entry);
	});
};

export const logUnexpectedNetworkError = (message, errorLike, options = {}) => {
	if (isExpectedAbortError(errorLike, options)) return false;
	console.error(message, errorLike);
	return true;
};
