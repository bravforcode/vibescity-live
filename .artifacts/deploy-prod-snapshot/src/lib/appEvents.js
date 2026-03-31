const appEventTarget = new EventTarget();

export const PARTNER_SIGNUP_SUCCESS_EVENT = "partner-signup-success";

const createCustomEvent = (type, detail) =>
	new CustomEvent(type, {
		detail,
	});

export const emitPartnerSignupSuccess = (payload = {}) => {
	appEventTarget.dispatchEvent(
		createCustomEvent(PARTNER_SIGNUP_SUCCESS_EVENT, {
			userId: payload.userId || "",
			tier: payload.tier || "",
			source: payload.source || "manual",
		}),
	);
};

export const onPartnerSignupSuccess = (handler) => {
	if (typeof handler !== "function") return () => {};

	const listener = (event) => {
		handler(event?.detail || {});
	};

	appEventTarget.addEventListener(PARTNER_SIGNUP_SUCCESS_EVENT, listener);
	return () => {
		appEventTarget.removeEventListener(PARTNER_SIGNUP_SUCCESS_EVENT, listener);
	};
};
