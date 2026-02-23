import { ref } from "vue";

function getPayPalClientId() {
	// Public client id is safe to expose in the frontend. Keep it optional so
	// missing config doesn't break app builds/dev.
	return import.meta.env.VITE_PAYPAL_CLIENT_ID || "";
}

function loadPayPalSdk({ clientId, currency = "USD", intent = "capture" }) {
	if (typeof window === "undefined")
		return Promise.reject(new Error("No window"));

	if (window.paypal) return Promise.resolve();
	if (!clientId) {
		return Promise.reject(new Error("Missing VITE_PAYPAL_CLIENT_ID"));
	}

	const existing = document.querySelector('script[data-vc-paypal-sdk="1"]');
	if (existing) {
		return new Promise((resolve, reject) => {
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener(
				"error",
				() => reject(new Error("PayPal SDK load failed")),
				{
					once: true,
				},
			);
		});
	}

	const src = new URL("https://www.paypal.com/sdk/js");
	src.searchParams.set("client-id", clientId);
	src.searchParams.set("currency", currency);
	src.searchParams.set("intent", intent);

	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = src.toString();
		script.async = true;
		script.defer = true;
		script.dataset.vcPaypalSdk = "1";
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("PayPal SDK load failed"));
		document.head.appendChild(script);
	});
}

export function usePayPal() {
	const isReady = ref(false);
	const error = ref(null);

	const loadPayPal = async (currency = "USD") => {
		try {
			await loadPayPalSdk({
				clientId: getPayPalClientId(),
				currency,
				intent: "capture",
			});
			isReady.value = true;
		} catch (err) {
			error.value = err;
			// Do not crash the app if PayPal is not configured; leave the error in
			// state so the UI can decide what to show.
			if (import.meta.env.DEV) console.error("PayPal Load Error:", err);
		}
	};

	const renderButton = (containerId, { amount, onSuccess, onError }) => {
		if (!window.paypal) return;

		window.paypal
			.Buttons({
				createOrder: (_data, actions) => {
					return actions.order.create({
						purchase_units: [
							{
								amount: {
									value: amount.toString(), // Must be string
									currency_code: "USD",
								},
							},
						],
					});
				},
				onApprove: async (_data, actions) => {
					try {
						const order = await actions.order.capture();
						onSuccess(order);
					} catch (err) {
						onError(err);
					}
				},
				onError: (err) => {
					onError(err);
				},
			})
			.render(containerId);
	};

	return {
		isReady,
		error,
		loadPayPal,
		renderButton,
	};
}
