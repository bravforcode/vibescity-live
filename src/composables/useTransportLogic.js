import { getCurrentInstance, onUnmounted, ref } from "vue";
import i18n from "@/i18n.js";
import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import {
	isExpectedAbortError,
	logUnexpectedNetworkError,
} from "../utils/networkErrorUtils";

const BASE_URL = getApiV1BaseUrl();
const RIDE_ESTIMATE_TIMEOUT_MS = 4500;
const RIDE_ESTIMATE_FALLBACKS = Object.freeze([
	{
		name: "Grab",
		service: "JustGrab",
		price: 145,
		currency: "THB",
		eta_mins: 4,
		icon: "🚗",
	},
	{
		name: "Bolt",
		service: "Economy",
		price: 120,
		currency: "THB",
		eta_mins: 8,
		icon: "⚡",
	},
	{
		name: "Lineman",
		service: "Taxi",
		price: 89,
		currency: "THB",
		eta_mins: 6,
		icon: "🏍️",
	},
]);

export function useTransportLogic() {
	const estimates = ref([]);
	const isLoading = ref(false);
	const error = ref(null);
	let activeRequestId = 0;
	let activeController = null;
	let activeTimeoutId = null;
	let disposed = false;

	const applyFallbackEstimates = () => {
		estimates.value = RIDE_ESTIMATE_FALLBACKS.map((estimate) => ({
			...estimate,
		}));
		error.value = null;
	};

	const clearActiveTimeout = () => {
		if (activeTimeoutId) {
			clearTimeout(activeTimeoutId);
			activeTimeoutId = null;
		}
	};

	const releaseRequest = (controller) => {
		if (activeController !== controller) return;
		clearActiveTimeout();
		activeController = null;
	};

	const abortActiveRequest = (reason) => {
		clearActiveTimeout();
		if (!activeController) return;
		const controller = activeController;
		activeController = null;
		controller.abort(reason);
	};

	/** Abort any in-flight request and clear the timeout */
	const cleanup = (reason = "component_unmounted") => {
		disposed = reason === "component_unmounted" ? true : disposed;
		activeRequestId += 1;
		abortActiveRequest(reason);
	};

	if (getCurrentInstance()) {
		onUnmounted(() => {
			cleanup();
		});
	}

	const fetchRideEstimates = async (destinationShop, userLocation) => {
		if (!destinationShop || !userLocation) return;

		// Abort previous request if still in-flight
		disposed = false;
		abortActiveRequest("request_replaced");
		const requestId = ++activeRequestId;

		isLoading.value = true;
		error.value = null;
		estimates.value = [];
		let controller = null;

		try {
			const [lat, lng] = userLocation;
			// Build payload matching backend RideEstimateRequest
			const payload = {
				origin: { lat, lng },
				destination: {
					lat: destinationShop.lat,
					lng: destinationShop.lng,
				},
			};

			controller = new AbortController();
			activeController = controller;
			activeTimeoutId = setTimeout(
				() => controller.abort("ride_estimate_timeout"),
				RIDE_ESTIMATE_TIMEOUT_MS,
			);

			const response = await fetch(`${BASE_URL}/rides/estimate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			if (
				disposed ||
				requestId !== activeRequestId ||
				controller.signal.aborted
			) {
				return;
			}

			if (!response.ok) {
				throw new Error(i18n.global.t("auto.k_1b9abe6e"));
			}

			const contentType = String(response.headers.get("content-type") || "");
			if (!contentType.includes("application/json")) {
				throw new Error(i18n.global.t("auto.k_e0c5db9c"));
			}

			const data = await response.json();
			if (
				disposed ||
				requestId !== activeRequestId ||
				controller.signal.aborted
			) {
				return;
			}
			estimates.value = Array.isArray(data?.providers) ? data.providers : [];
		} catch (err) {
			const abortReason = String(controller?.signal?.reason || "");
			const isExpectedAbort = isExpectedAbortError(err, {
				signal: controller?.signal,
			});
			if (
				requestId !== activeRequestId ||
				(isExpectedAbort && abortReason !== "ride_estimate_timeout")
			) {
				return;
			}
			if (import.meta.env.DEV) {
				logUnexpectedNetworkError(
					"Ride API failed, activating fallback:",
					err,
					{
						signal: controller?.signal,
					},
				);
			}

			// ✅ Loki Mode: GUARANTEED Fallback
			applyFallbackEstimates();
		} finally {
			releaseRequest(controller);
			if (requestId === activeRequestId) {
				isLoading.value = false;
			}
		}
	};

	return {
		estimates,
		isLoading,
		error,
		fetchRideEstimates,
		cleanup,
	};
}
