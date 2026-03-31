/**
 * Performance Utility: Preload critical assets to improve LCP/FCP
 */
export const preloadAssets = (urls) => {
	if (typeof window === "undefined") return;

	urls.forEach((url) => {
		const link = document.createElement("link");
		link.href = url;

		if (url.endsWith(".woff2") || url.endsWith(".woff")) {
			link.rel = "preload";
			link.as = "font";
			link.type = "font/woff2";
			link.crossOrigin = "anonymous";
		} else if (url.endsWith(".json")) {
			link.rel = "prefetch"; // Lower priority for large map styles
			link.as = "fetch";
			link.crossOrigin = "anonymous";
		} else if (url.match(/\.(webp|avif|jpe?g|png)$/i)) {
			link.rel = "preload";
			link.as = "image";
		}

		document.head.appendChild(link);
	});
};
