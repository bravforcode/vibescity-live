const defaultOptions = {
	path: "/",
	maxAgeSeconds: 60 * 60 * 24 * 365,
	sameSite: "Lax",
};

const setViaDescriptor = (cookieString) => {
	if (typeof document === "undefined") return;
	const descriptor =
		Object.getOwnPropertyDescriptor(Document.prototype, "cookie") ||
		Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "cookie");
	descriptor?.set?.call(document, cookieString);
};

export const setClientCookie = (name, value, options = {}) => {
	if (typeof document === "undefined") return;

	const merged = { ...defaultOptions, ...options };
	const encodedValue = encodeURIComponent(String(value ?? ""));
	const cookieString = `${name}=${encodedValue}; Path=${merged.path}; Max-Age=${merged.maxAgeSeconds}; SameSite=${merged.sameSite}`;

	const cookieStoreApi = globalThis.cookieStore;
	if (cookieStoreApi?.set) {
		cookieStoreApi
			.set({
				name,
				value: encodedValue,
				path: merged.path,
				expires: new Date(Date.now() + merged.maxAgeSeconds * 1000),
				sameSite: String(merged.sameSite || "Lax").toLowerCase(),
			})
			.catch(() => setViaDescriptor(cookieString));
		return;
	}

	setViaDescriptor(cookieString);
};
