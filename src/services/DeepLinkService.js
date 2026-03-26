/**
 * src/services/DeepLinkService.js
 * Ride deep-link + real web fallback with telemetry.
 */

import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import { isMobileDevice } from "../utils/browserUtils";
import { apiFetch } from "./apiClient";
import { getOrCreateVisitorId } from "./visitorIdentity";

const PROVIDER_WEB_FALLBACK = {
	grab: "https://www.grab.com/th/transport/",
	bolt: "https://bolt.eu/en-th/",
	lineman: "https://lineman.line.me/",
};
const LOCALHOST_RE = /localhost|127\.0\.0\.1/i;
let telemetryFailureCount = 0;
let telemetryCircuitOpen = false;
const TELEMETRY_FAILURE_LIMIT = 2;

const shouldSkipTelemetry = () => {
	if (typeof window === "undefined") return false;
	if (!LOCALHOST_RE.test(window.location.hostname)) return false;
	try {
		const apiOrigin = new URL(getApiV1BaseUrl()).origin;
		return apiOrigin !== window.location.origin;
	} catch {
		return false;
	}
};

const markTelemetryFailure = () => {
	telemetryFailureCount += 1;
	if (telemetryFailureCount >= TELEMETRY_FAILURE_LIMIT) {
		telemetryCircuitOpen = true;
	}
};

const markTelemetrySuccess = () => {
	telemetryFailureCount = 0;
};

const encodeDestination = (shop) => {
	const lat = Number(shop?.lat ?? shop?.latitude);
	const lng = Number(shop?.lng ?? shop?.longitude);
	return {
		lat: Number.isFinite(lat) ? lat : null,
		lng: Number.isFinite(lng) ? lng : null,
		name: encodeURIComponent(shop?.name || shop?.Name || ""),
		address: encodeURIComponent(shop?.address || shop?.Address || ""),
	};
};

const logRideTelemetry = ({
	provider,
	stage,
	shop,
	lat,
	lng,
	fallbackUrl,
	didUseFallback,
	errorMessage = "",
}) => {
	if (telemetryCircuitOpen || shouldSkipTelemetry()) return;

	const payload = {
		event_type: "ride_launch_attempt",
		visitor_id: getOrCreateVisitorId(),
		data: {
			provider,
			stage,
			shop_id: shop?.id ?? null,
			shop_name: shop?.name || shop?.Name || "",
			lat,
			lng,
			fallback_url: fallbackUrl || "",
			did_use_fallback: Boolean(didUseFallback),
			is_mobile: isMobileDevice(),
			error: String(errorMessage || ""),
		},
	};

	void apiFetch("/analytics/log", {
		method: "POST",
		includeVisitor: true,
		refreshVisitorTokenIfNeeded: false,
		body: payload,
	})
		.then((res) => {
			if (!res?.ok) {
				markTelemetryFailure();
				return;
			}
			markTelemetrySuccess();
		})
		.catch(() => {
			markTelemetryFailure();
		});
};

/**
 * Checks if a specific app is installed (Best Effort/Heuristic).
 * @param {string} appName - 'grab', 'bolt', 'lineman'
 * @returns {Promise<boolean>}
 */
export const checkAppInstalled = (appName) => {
	return new Promise((resolve) => {
		if (!isMobileDevice()) {
			resolve(false);
			return;
		}

		const startTime = Date.now();
		const iframe = document.createElement("iframe");
		iframe.style.display = "none";

		let deepLink = "";
		switch (appName.toLowerCase()) {
			case "grab":
				deepLink = "grab://";
				break;
			case "bolt":
				deepLink = "bolt://";
				break;
			case "lineman":
				deepLink = "lineman://";
				break;
			default:
				resolve(false);
				return;
		}

		iframe.src = deepLink;
		document.body.appendChild(iframe);

		let resolved = false;

		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden" && !resolved) {
				resolved = true;
				iframe.remove();
				resolve(true);
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange);

		setTimeout(() => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			if (!resolved) {
				resolved = true;
				iframe.remove();
				const elapsed = Date.now() - startTime;
				resolve(elapsed > 100);
			}
		}, 300);
	});
};

const openRealWebFallback = (webUrl) => {
	window.location.assign(webUrl);
};

const openDeepLink = ({ provider, deepLink, webUrl, shop, lat, lng }) => {
	if (!webUrl) return false;

	const useDeepLink = Boolean(deepLink) && isMobileDevice();
	logRideTelemetry({
		provider,
		stage: useDeepLink ? "deep_link_attempt" : "web_only_attempt",
		shop,
		lat,
		lng,
		fallbackUrl: webUrl,
		didUseFallback: !useDeepLink,
	});

	if (useDeepLink) {
		window.location.href = deepLink;

		const timer = setTimeout(() => {
			if (document.visibilityState === "visible") {
				openRealWebFallback(webUrl);
				logRideTelemetry({
					provider,
					stage: "web_fallback_opened",
					shop,
					lat,
					lng,
					fallbackUrl: webUrl,
					didUseFallback: true,
				});
			}
		}, 1400);

		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				clearTimeout(timer);
				logRideTelemetry({
					provider,
					stage: "deep_link_opened",
					shop,
					lat,
					lng,
					fallbackUrl: webUrl,
					didUseFallback: false,
				});
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange, {
			once: true,
		});

		return true;
	}

	openRealWebFallback(webUrl);
	logRideTelemetry({
		provider,
		stage: "web_opened_direct",
		shop,
		lat,
		lng,
		fallbackUrl: webUrl,
		didUseFallback: true,
	});
	return true;
};

export const openGrabApp = (shop) => {
	try {
		const { lat, lng, name, address } = encodeDestination(shop);
		const deepLink =
			lat !== null && lng !== null
				? `grab://open?screenType=BOOKING&dropOffLatitude=${lat}&dropOffLongitude=${lng}&dropOffName=${name}`
				: "grab://";
		const webUrl =
			lat !== null && lng !== null
				? `https://www.grab.com/th/transport/?dropoffLat=${lat}&dropoffLng=${lng}&dropoffName=${name}&dropoffAddress=${address}`
				: PROVIDER_WEB_FALLBACK.grab;

		return openDeepLink({
			provider: "grab",
			deepLink,
			webUrl,
			shop,
			lat,
			lng,
		});
	} catch (error) {
		logRideTelemetry({
			provider: "grab",
			stage: "error",
			shop,
			lat: null,
			lng: null,
			fallbackUrl: PROVIDER_WEB_FALLBACK.grab,
			didUseFallback: true,
			errorMessage: error?.message || "open_grab_failed",
		});
		openRealWebFallback(PROVIDER_WEB_FALLBACK.grab);
		return true;
	}
};

export const openBoltApp = (shop) => {
	try {
		const { lat, lng, name } = encodeDestination(shop);
		const deepLink =
			lat !== null && lng !== null
				? `bolt://ride?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`
				: "bolt://";
		const webUrl =
			lat !== null && lng !== null
				? `https://bolt.eu/en-th/?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`
				: PROVIDER_WEB_FALLBACK.bolt;

		return openDeepLink({
			provider: "bolt",
			deepLink,
			webUrl,
			shop,
			lat,
			lng,
		});
	} catch (error) {
		logRideTelemetry({
			provider: "bolt",
			stage: "error",
			shop,
			lat: null,
			lng: null,
			fallbackUrl: PROVIDER_WEB_FALLBACK.bolt,
			didUseFallback: true,
			errorMessage: error?.message || "open_bolt_failed",
		});
		openRealWebFallback(PROVIDER_WEB_FALLBACK.bolt);
		return true;
	}
};

export const openLinemanApp = (shop) => {
	try {
		const { lat, lng, name } = encodeDestination(shop);
		const deepLink =
			lat !== null && lng !== null
				? `lineman://taxi?dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`
				: "lineman://";
		// NOTE:
		// Lineman OneLink URL with custom dropoff params intermittently returns 400.
		// Use the stable web fallback to avoid broken redirects.
		const webUrl = PROVIDER_WEB_FALLBACK.lineman;

		return openDeepLink({
			provider: "lineman",
			deepLink,
			webUrl,
			shop,
			lat,
			lng,
		});
	} catch (error) {
		logRideTelemetry({
			provider: "lineman",
			stage: "error",
			shop,
			lat: null,
			lng: null,
			fallbackUrl: PROVIDER_WEB_FALLBACK.lineman,
			didUseFallback: true,
			errorMessage: error?.message || "open_lineman_failed",
		});
		openRealWebFallback(PROVIDER_WEB_FALLBACK.lineman);
		return true;
	}
};

export const openRideApp = (appName, shop) => {
	switch (String(appName || "").toLowerCase()) {
		case "grab":
			return openGrabApp(shop);
		case "bolt":
			return openBoltApp(shop);
		case "lineman":
			return openLinemanApp(shop);
		default:
			return false;
	}
};
