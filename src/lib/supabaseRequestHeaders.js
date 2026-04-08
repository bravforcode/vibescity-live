const SUPABASE_FUNCTION_PATH_FRAGMENT = "/functions/v1/";
const VISITOR_HEADER_KEYS = [
	"vibe_visitor_id",
	"vibe-visitor-id",
	"x-vibe-visitor-id",
];

const toNormalizedUrl = (value) => {
	try {
		return new URL(String(value || "")).toString();
	} catch {
		return String(value || "");
	}
};

export const isSupabaseFunctionRequest = (requestUrl, supabaseBaseUrl = "") => {
	const normalizedRequestUrl = toNormalizedUrl(requestUrl);
	if (!normalizedRequestUrl) return false;

	if (!normalizedRequestUrl.includes(SUPABASE_FUNCTION_PATH_FRAGMENT)) {
		return false;
	}

	const normalizedSupabaseBaseUrl = toNormalizedUrl(supabaseBaseUrl);
	if (!normalizedSupabaseBaseUrl) {
		return normalizedRequestUrl.includes("supabase.co");
	}

	return normalizedRequestUrl.startsWith(normalizedSupabaseBaseUrl);
};

export const sanitizeSupabaseRequestHeaders = ({
	requestUrl,
	headersInit,
	supabaseBaseUrl = "",
}) => {
	if (!isSupabaseFunctionRequest(requestUrl, supabaseBaseUrl)) {
		return headersInit;
	}

	const headers = new Headers(headersInit || {});
	for (const key of VISITOR_HEADER_KEYS) {
		headers.delete(key);
	}
	return headers;
};
