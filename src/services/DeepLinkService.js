/**
 * src/services/DeepLinkService.js
 * Specialized service for handling App Deep Links and Intent detection.
 * Adheres to SRP (Single Responsibility Principle).
 */

import { isMobileDevice } from "../utils/browserUtils";

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

		/**
		 * Heuristic-based app detection:
		 * - This is a best-effort approximation, NOT a guaranteed detection.
		 * - The 300ms timeout can produce false positives (returns true even if app didn't open)
		 *   because OS navigation timing varies by device/load.
		 * - More reliable signal: document.visibilitychange (page becomes hidden if app opens)
		 * - Use this primarily for UX hints, not critical logic decisions.
		 */
		let resolved = false;

		// Listen for visibility change as more reliable signal
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden" && !resolved) {
				resolved = true;
				iframe.remove();
				resolve(true); // App likely opened
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange);

		setTimeout(() => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			if (!resolved) {
				resolved = true;
				iframe.remove();
				const elapsed = Date.now() - startTime;
				// Best-effort heuristic: if elapsed > 100ms, maybe app responded
				resolve(elapsed > 100);
			}
		}, 300);
	});
};

const openDeepLink = (deepLink, webUrl) => {
	if (deepLink) {
		window.location.href = deepLink;

		// Fallback if app doesn't open
		const timer = setTimeout(() => {
			if (document.visibilityState === "visible") {
				window.open(webUrl, "_blank", "noopener,noreferrer");
			}
		}, 1500); // 1.5s timeout for better UX

		// Clear timer if user switched away (app opened)
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				clearTimeout(timer);
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange, {
			once: true,
		});

		return true;
	} else {
		window.open(webUrl, "_blank", "noopener,noreferrer");
		return true;
	}
};

export const openGrabApp = (shop) => {
	try {
		const lat = shop.lat || shop.latitude;
		const lng = shop.lng || shop.longitude;
		const name = encodeURIComponent(shop.name || shop.Name || "");
		const address = encodeURIComponent(shop.address || shop.Address || "");

		if (!lat || !lng) return false;

		// Grab Standardized
		// Android/iOS Deep Link
		const deepLink = `grab://open?screenType=BOOKING&dropOffLatitude=${lat}&dropOffLongitude=${lng}&dropOffName=${name}`;
		const webUrl = `https://m.grab.com/th/ride/?pickupType=point&pickupAddress=&dropoffType=point&dropoffAddress=${address}&dropoffLat=${lat}&dropoffLng=${lng}`;

		return openDeepLink(isMobileDevice() ? deepLink : null, webUrl);
	} catch (error) {
		console.error("Error opening Grab:", error);
		return false;
	}
};

export const openBoltApp = (shop) => {
	try {
		const lat = shop.lat || shop.latitude;
		const lng = shop.lng || shop.longitude;
		const name = encodeURIComponent(shop.name || shop.Name || "");

		if (!lat || !lng) return false;

		const deepLink = `bolt://ride?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
		const webUrl = `https://bolt.eu/th-th/ride/?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;

		return openDeepLink(isMobileDevice() ? deepLink : null, webUrl);
	} catch (error) {
		console.error("Error opening Bolt:", error);
		return false;
	}
};

export const openLinemanApp = (shop) => {
	try {
		const lat = shop.lat || shop.latitude;
		const lng = shop.lng || shop.longitude;
		const name = encodeURIComponent(shop.name || shop.Name || "");

		if (!lat || !lng) return false;

		const deepLink = `lineman://taxi?dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`;
		// OneLink usually handles redirection better
		const webUrl = `https://lineman.onelink.me/2695613898?af_dp=lineman://taxi&dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`;

		return openDeepLink(isMobileDevice() ? deepLink : null, webUrl);
	} catch (error) {
		console.error("Error opening Lineman:", error);
		return false;
	}
};

export const openRideApp = (appName, shop) => {
	switch (appName.toLowerCase()) {
		case "grab":
			return openGrabApp(shop);
		case "bolt":
			return openBoltApp(shop);
		case "lineman":
			return openLinemanApp(shop);
		default:
			console.error("Unknown ride app:", appName);
			return false;
	}
};
