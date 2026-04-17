/**
 * Performance Utility: Preload critical assets to improve LCP/FCP
 */
export const preloadAssets = (urls, options = { fetchPriority: "auto" }) => {
	if (typeof window === "undefined") return;

	urls.forEach((url) => {
		const link = document.createElement("link");
		link.href = url;

		if (options.fetchPriority && options.fetchPriority !== "auto") {
			link.fetchPriority = options.fetchPriority;
		}

		if (url.endsWith(".woff2") || url.endsWith(".woff")) {
			link.rel = "preload";
			link.as = "font";
			link.type = "font/woff2";
			link.crossOrigin = "anonymous";
			if (options.fetchPriority === "high") link.fetchPriority = "high";
		} else if (url.endsWith(".json")) {
			link.rel = "prefetch"; // Lower priority for large map styles
			link.as = "fetch";
			link.crossOrigin = "anonymous";
		} else if (url.match(/\.(webp|avif|jpe?g|png|svg)$/i)) {
			link.rel = "preload";
			link.as = "image";
			link.fetchPriority = options.fetchPriority || "high"; // Image LCP is critical
		}

		document.head.appendChild(link);
	});
};
