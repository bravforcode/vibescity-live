import { ref } from "vue";
import { getApiBaseUrl } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabase";

export function useStripe() {
	const isLoading = ref(false);
	const error = ref(null);

	const startCheckout = async (itemType, itemId) => {
		isLoading.value = true;
		error.value = null;

		try {
			// 1. Get Supabase Session Token (secure method)
			const {
				data: { session },
				error: authError,
			} = await supabase.auth.getSession();

			if (authError || !session?.access_token) {
				throw new Error("Please login first");
			}

			// 2. Call Backend
			const apiUrl = getApiBaseUrl();

			const response = await fetch(
				`${apiUrl}/api/v1/payments/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({
						itemType,
						itemId,
						successUrl: `${window.location.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
						cancelUrl: `${window.location.origin}/payment/cancel`,
					}),
				},
			);

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.detail || "Checkout initialization failed");
			}

			const data = await response.json();

			// 3. Redirect to Stripe Checkout
			if (data.url) {
				window.location.href = data.url;
			} else {
				throw new Error("No checkout URL returned");
			}
		} catch (err) {
			if (import.meta.env.DEV) {
				console.error("Payment Error:", err);
			}
			error.value = err.message || "Payment failed";
		} finally {
			isLoading.value = false;
		}
	};

	return {
		startCheckout,
		isLoading,
		error,
	};
}
