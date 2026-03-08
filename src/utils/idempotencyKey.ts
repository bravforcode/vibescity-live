const sanitize = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 2048);

const stableStringify = (input: unknown): string => {
	if (input === null || input === undefined) return "";
	if (typeof input !== "object") return sanitize(input);
	if (Array.isArray(input))
		return `[${input.map((item) => stableStringify(item)).join(",")}]`;

	const entries = Object.entries(input as Record<string, unknown>)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}:${stableStringify(value)}`);
	return `{${entries.join(",")}}`;
};

const fnv1a = (text: string): string => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createIdempotencyKey = (
	endpoint: string,
	payload: unknown,
	scope = "default",
): string => {
	const endpointPart = sanitize(endpoint).toLowerCase() || "unknown-endpoint";
	const scopePart = sanitize(scope).toLowerCase() || "default";
	const payloadHash = fnv1a(stableStringify(payload));
	const minuteBucket = Math.floor(Date.now() / 60_000).toString(36);
	return `${scopePart}:${endpointPart}:${payloadHash}:${minuteBucket}`;
};
