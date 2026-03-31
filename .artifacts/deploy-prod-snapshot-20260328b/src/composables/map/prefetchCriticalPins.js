import { isAppDebugLoggingEnabled } from "../../utils/debugFlags";

const CRITICAL_PIN_IMAGES = {
	"pin-normal": "/images/pins/pin-gray.png",
	"pin-cyan": "/images/pins/pin-blue.png",
	"pin-blue": "/images/pins/pin-blue.png",
	"pin-red": "/images/pins/pin-red.png",
};

const decodePinImage = (url) =>
	new Promise((resolve) => {
		if (!url || typeof url !== "string") return resolve(false);
		const img = new Image();
		img.src = url;
		if (typeof img.decode === "function") {
			img
				.decode()
				.then(() => resolve(true))
				.catch(() => resolve(false));
			return;
		}
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
	});

export const prefetchCriticalPins = async () => {
	const entries = Object.entries(CRITICAL_PIN_IMAGES);
	const results = await Promise.allSettled(
		entries.map(([, url]) => decodePinImage(url)),
	);

	if (isAppDebugLoggingEnabled()) {
		const loaded = results.filter(
			(result) => result.status === "fulfilled" && result.value,
		).length;
		console.log(
			`[prefetchCriticalPins] Prefetched ${loaded}/${entries.length} critical pin images`,
		);
	}
};
