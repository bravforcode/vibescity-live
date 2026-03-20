const SCRIPT_ID = "vibecity-speculation-rules";
const PREFETCH_TRACK_LIMIT = 300;
const prefetchedUrls = new Set();
let currentScript = null;
let pendingUrls = null;
let isUpdating = false;

const supportsSpeculationRules = () => {
	if (typeof HTMLScriptElement === "undefined") return false;
	if (typeof HTMLScriptElement.supports !== "function") return false;
	return HTMLScriptElement.supports("speculationrules");
};

const sanitizeUrl = (value) => {
	const raw = String(value || "").trim();
	if (!raw || !raw.startsWith("/")) return "";
	return raw.slice(0, 240);
};

const getScriptElement = () => {
	if (typeof document === "undefined") return null;
	const existing = document.getElementById(SCRIPT_ID);
	return existing instanceof HTMLScriptElement ? existing : null;
};

const rememberUrls = (urls = []) => {
	for (const url of urls) {
		prefetchedUrls.add(url);
	}
	if (prefetchedUrls.size <= PREFETCH_TRACK_LIMIT) return;
	const compacted = [...prefetchedUrls].slice(-PREFETCH_TRACK_LIMIT);
	prefetchedUrls.clear();
	for (const url of compacted) prefetchedUrls.add(url);
};

const buildScriptElement = (payload) => {
	if (typeof document === "undefined") return null;
	const script = document.createElement("script");
	script.id = SCRIPT_ID;
	script.type = "speculationrules";
	script.appendChild(document.createTextNode(JSON.stringify(payload)));
	return script;
};

const replaceScript = (nextScript) => {
	if (!nextScript || typeof document === "undefined") return false;
	const previous = currentScript || getScriptElement();
	if (previous?.parentNode) {
		previous.parentNode.removeChild(previous);
	}
	document.head.appendChild(nextScript);
	currentScript = nextScript;
	return true;
};

export const speculationRulesService = {
	isSupported() {
		return supportsSpeculationRules();
	},
	updateVenuePrefetchUrls(urls = []) {
		if (!supportsSpeculationRules()) return false;
		const unique = [...new Set(urls.map(sanitizeUrl).filter(Boolean))].slice(
			0,
			30,
		);
		if (!unique.length) return false;
		if (isUpdating) {
			pendingUrls = unique;
			return true;
		}
		const payload = {
			prefetch: [
				{
					source: "list",
					urls: unique,
					eagerness: "moderate",
				},
			],
		};
		let shouldUpdateQueuedUrls = false;
		let queuedUrls = null;
		let didReplace = false;
		isUpdating = true;
		try {
			const script = buildScriptElement(payload);
			const replaced = replaceScript(script);
			if (!replaced) return false;
			rememberUrls(unique);
			didReplace = true;
		} finally {
			isUpdating = false;
			if (pendingUrls && pendingUrls !== unique) {
				queuedUrls = pendingUrls;
				shouldUpdateQueuedUrls = true;
			}
			pendingUrls = null;
		}
		if (shouldUpdateQueuedUrls && queuedUrls) {
			return this.updateVenuePrefetchUrls(queuedUrls);
		}
		return didReplace;
	},
	wasLikelyPrefetched(pathname = "") {
		const path = sanitizeUrl(pathname);
		return Boolean(path) && prefetchedUrls.has(path);
	},
};
