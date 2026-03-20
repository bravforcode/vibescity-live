import { v4 as uuidv4 } from "uuid";
import { invokePublicEdgeFunction } from "./publicEdgeFunctionClient";

const ENDPOINT = "pii-audit-ingest";
const STORAGE_KEY_VISITOR = "vibe_visitor_id";
const INVOKE_TIMEOUT_MS = 2500;
const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;

const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

// Default: disabled in dev, enabled in prod (unless explicitly overridden).
const piiAuditEnabled =
	parseEnvBool(import.meta.env.VITE_PII_AUDIT_ENABLED) ??
	(!import.meta.env.DEV &&
		!(
			typeof window !== "undefined" &&
			LOCALHOST_PATTERN.test(window.location.hostname)
		));

let lastPingAt = 0;
const MIN_PING_INTERVAL_MS = 2 * 60 * 1000;

const getVisitorId = () => {
	try {
		let id = localStorage.getItem(STORAGE_KEY_VISITOR);
		if (!id) {
			id = uuidv4();
			localStorage.setItem(STORAGE_KEY_VISITOR, id);
		}
		return id;
	} catch {
		return uuidv4();
	}
};

export const piiAuditService = {
	getVisitorId,

	async ping(reason = "app_ping") {
		// Never run in local development or localhost preview — edge CORS usually rejects these origins.
		if (
			import.meta.env.DEV ||
			(typeof window !== "undefined" &&
				LOCALHOST_PATTERN.test(window.location.hostname))
		)
			return;
		if (!piiAuditEnabled) return;
		const now = Date.now();
		if (now - lastPingAt < MIN_PING_INTERVAL_MS) return;
		lastPingAt = now;

		try {
			// Fail-open: never block UX on audit logging.
			await invokePublicEdgeFunction(ENDPOINT, {
				body: {
					visitor_id: getVisitorId(),
					reason,
				},
				timeout: INVOKE_TIMEOUT_MS,
			});
		} catch {
			// ignore
		}
	},

	getStatus() {
		return { enabled: piiAuditEnabled, lastPingAt };
	},
};
