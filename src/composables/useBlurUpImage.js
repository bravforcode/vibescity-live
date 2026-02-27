/**
 * useBlurUpImage — Progressive blur-up image loading.
 * Shows a tiny blurred placeholder instantly, then fades to the full image.
 *
 * Usage:
 *   const { imgSrc, isLoaded, blurStyle } = useBlurUpImage(url, { width: 20 });
 *   <img :src="imgSrc" :class="{ 'blur-loaded': isLoaded }" :style="blurStyle" />
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";

/**
 * @param {import('vue').Ref<string|null>|string} imageUrl - The full image URL
 * @param {Object} opts
 * @param {number} [opts.thumbWidth=24] - Tiny thumbnail width for blur placeholder
 */
export function useBlurUpImage(imageUrl, opts = {}) {
	const { thumbWidth = 24 } = opts;
	const isLoaded = ref(false);
	const hasError = ref(false);
	let img = null;

	const resolvedUrl = computed(() => {
		const url = typeof imageUrl === "string" ? imageUrl : imageUrl?.value;
		return url || null;
	});

	// Generate a tiny thumbnail URL if the source supports width transforms
	const thumbUrl = computed(() => {
		const url = resolvedUrl.value;
		if (!url) return null;

		// Supabase storage: add /render/image/public transform
		if (url.includes("supabase") && url.includes("/storage/")) {
			const separator = url.includes("?") ? "&" : "?";
			return `${url}${separator}width=${thumbWidth}&quality=10`;
		}

		// Cloudinary: insert w_XX,q_auto:low transform
		if (url.includes("cloudinary.com")) {
			return url.replace("/upload/", `/upload/w_${thumbWidth},q_10,f_auto/`);
		}

		// Imgix: Append width and quality params
		if (url.includes("imgix.net")) {
			const separator = url.includes("?") ? "&" : "?";
			return `${url}${separator}w=${thumbWidth}&q=10&auto=format`;
		}

		// Fallback: just use the original (no blur-up for unknown sources)
		return null;
	});

	// The src to display — thumb first, then full image
	const imgSrc = computed(() => {
		if (isLoaded.value) return resolvedUrl.value;
		return thumbUrl.value || resolvedUrl.value;
	});

	// CSS filter for the blur-up effect
	const blurStyle = computed(() => {
		if (!thumbUrl.value) return {}; // No blur-up available
		return isLoaded.value
			? { filter: "none", transition: "filter 0.5s ease-out" }
			: {
					filter: "blur(12px)",
					transform: "scale(1.05)",
					transition: "filter 0.5s ease-out, transform 0.5s ease-out",
				};
	});

	// Preload the full image in background
	const preloadFull = (url) => {
		cleanup();
		if (!url) return;
		isLoaded.value = false;
		hasError.value = false;

		img = new Image();
		img.onload = () => {
			isLoaded.value = true;
		};
		img.onerror = () => {
			hasError.value = true;
			// Still show whatever we have
			isLoaded.value = true;
		};
		img.src = url;
	};

	const cleanup = () => {
		if (img) {
			img.onload = null;
			img.onerror = null;
			img = null;
		}
	};

	watch(
		resolvedUrl,
		(url) => {
			if (url) preloadFull(url);
		},
		{ immediate: true },
	);

	onBeforeUnmount(cleanup);

	return {
		/** The URL to bind to <img :src=""> */
		imgSrc,
		/** Whether the full-res image has loaded */
		isLoaded,
		/** Whether the image failed to load */
		hasError,
		/** Inline styles to apply for blur-up effect */
		blurStyle,
		/** Tiny thumbnail URL (null if not available) */
		thumbUrl,
	};
}
