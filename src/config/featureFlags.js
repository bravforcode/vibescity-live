const toBoolean = (raw, fallback = false) => {
	if (raw === undefined || raw === null || raw === "") return fallback;
	const normalized = String(raw).trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const featureFlags = Object.freeze({
	enablePayPalPins: toBoolean(import.meta.env.VITE_FEATURE_PAYPAL_PINS, false),
	enableManualPins: toBoolean(import.meta.env.VITE_FEATURE_MANUAL_PINS, false),
	strictMapRequired: toBoolean(import.meta.env.VITE_E2E_MAP_REQUIRED, false),
});
