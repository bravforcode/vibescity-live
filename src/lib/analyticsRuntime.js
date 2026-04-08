export const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

export const isBrowserAnalyticsEnabled = ({
	analyticsEnabledEnv = import.meta.env.VITE_ANALYTICS_ENABLED,
	analyticsDisabledEnv = import.meta.env.VITE_DISABLE_ANALYTICS,
} = {}) => {
	if (parseEnvBool(analyticsDisabledEnv) === true) {
		return false;
	}

	// Browser analytics is explicit opt-in until the production ingest lane is
	// consistently healthy across the active Supabase project and custom domains.
	return parseEnvBool(analyticsEnabledEnv) === true;
};

export const hasAnalyticsConsent = ({
	storage = globalThis.localStorage,
	doNotTrack = globalThis.navigator?.doNotTrack,
} = {}) => {
	try {
		if (String(doNotTrack || "") === "1") {
			return false;
		}
		return storage?.getItem?.("vibe_analytics_consent") === "granted";
	} catch {
		return false;
	}
};
