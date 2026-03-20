/**
 * Image Optimization Utilities
 *
 * Features:
 * - Lazy loading
 * - Responsive images
 * - WebP support
 * - Blur placeholder
 * - Progressive loading
 * - Image compression
 */

// Lazy load image
export function lazyLoadImage(img, options = {}) {
	const {
		rootMargin = "50px",
		threshold = 0.01,
		placeholder = null,
		onLoad = null,
		onError = null,
	} = options;

	// Set placeholder
	if (placeholder) {
		img.src = placeholder;
	}

	// Check if IntersectionObserver is supported
	if (!("IntersectionObserver" in window)) {
		loadImage(img, onLoad, onError);
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					loadImage(img, onLoad, onError);
					observer.unobserve(img);
				}
			});
		},
		{ rootMargin, threshold },
	);

	observer.observe(img);
}

// Load image
function loadImage(img, onLoad, onError) {
	const src = img.dataset.src || img.getAttribute("data-src");
	const srcset = img.dataset.srcset || img.getAttribute("data-srcset");

	if (!src) return;

	// Create new image to preload
	const tempImg = new Image();

	tempImg.onload = () => {
		img.src = src;
		if (srcset) {
			img.srcset = srcset;
		}
		img.classList.add("loaded");
		if (onLoad) onLoad(img);
	};

	tempImg.onerror = () => {
		img.classList.add("error");
		if (onError) onError(img);
	};

	tempImg.src = src;
}

// Generate responsive image srcset
export function generateSrcSet(baseUrl, sizes = [320, 640, 960, 1280, 1920]) {
	return sizes.map((size) => `${baseUrl}?w=${size} ${size}w`).join(", ");
}

// Generate sizes attribute
export function generateSizes(
	breakpoints = {
		mobile: 320,
		tablet: 768,
		desktop: 1024,
	},
) {
	const sizes = [];

	if (breakpoints.mobile) {
		sizes.push(
			`(max-width: ${breakpoints.tablet - 1}px) ${breakpoints.mobile}px`,
		);
	}

	if (breakpoints.tablet) {
		sizes.push(
			`(max-width: ${breakpoints.desktop - 1}px) ${breakpoints.tablet}px`,
		);
	}

	if (breakpoints.desktop) {
		sizes.push(`${breakpoints.desktop}px`);
	}

	return sizes.join(", ");
}

// Check WebP support
export async function supportsWebP() {
	if (!self.createImageBitmap) return false;

	const webpData =
		"data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
	const blob = await fetch(webpData).then((r) => r.blob());

	return createImageBitmap(blob).then(
		() => true,
		() => false,
	);
}

// Get optimized image URL
export function getOptimizedImageUrl(url, options = {}) {
	const {
		width = null,
		height = null,
		quality = 80,
		format = "auto",
		fit = "cover",
	} = options;

	// If using Supabase Storage
	if (url.includes("supabase.co/storage")) {
		const params = new URLSearchParams();
		if (width) params.append("width", width);
		if (height) params.append("height", height);
		if (quality) params.append("quality", quality);
		if (format !== "auto") params.append("format", format);

		return `${url}?${params.toString()}`;
	}

	// If using Cloudinary or similar
	if (url.includes("cloudinary.com")) {
		const transformations = [];
		if (width) transformations.push(`w_${width}`);
		if (height) transformations.push(`h_${height}`);
		if (quality) transformations.push(`q_${quality}`);
		if (format !== "auto") transformations.push(`f_${format}`);
		transformations.push(`c_${fit}`);

		return url.replace("/upload/", `/upload/${transformations.join(",")}/`);
	}

	return url;
}

// Generate blur placeholder
export function generateBlurPlaceholder(width = 10, height = 10) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext("2d");
	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, "#f0f0f0");
	gradient.addColorStop(1, "#e0e0e0");

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);

	return canvas.toDataURL();
}

// Progressive image loading
export class ProgressiveImageLoader {
	constructor(img, options = {}) {
		this.img = img;
		this.options = {
			lowQualitySrc: null,
			highQualitySrc: null,
			transitionDuration: 300,
			...options,
		};

		this.isLoaded = false;
	}

	// Load
	async load() {
		if (this.isLoaded) return;

		// Load low quality first
		if (this.options.lowQualitySrc) {
			await this.loadLowQuality();
		}

		// Then load high quality
		if (this.options.highQualitySrc) {
			await this.loadHighQuality();
		}

		this.isLoaded = true;
	}

	// Load low quality
	async loadLowQuality() {
		return new Promise((resolve, reject) => {
			const tempImg = new Image();

			tempImg.onload = () => {
				this.img.src = this.options.lowQualitySrc;
				this.img.classList.add("low-quality");
				resolve();
			};

			tempImg.onerror = reject;
			tempImg.src = this.options.lowQualitySrc;
		});
	}

	// Load high quality
	async loadHighQuality() {
		return new Promise((resolve, reject) => {
			const tempImg = new Image();

			tempImg.onload = () => {
				this.img.style.transition = `opacity ${this.options.transitionDuration}ms`;
				this.img.classList.remove("low-quality");
				this.img.classList.add("high-quality");
				this.img.src = this.options.highQualitySrc;
				resolve();
			};

			tempImg.onerror = reject;
			tempImg.src = this.options.highQualitySrc;
		});
	}
}

// Image compression (client-side)
export async function compressImage(file, options = {}) {
	const {
		maxWidth = 1920,
		maxHeight = 1080,
		quality = 0.8,
		type = "image/jpeg",
	} = options;

	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (e) => {
			const img = new Image();

			img.onload = () => {
				const canvas = document.createElement("canvas");
				let { width, height } = img;

				// Calculate new dimensions
				if (width > maxWidth) {
					height = (height * maxWidth) / width;
					width = maxWidth;
				}

				if (height > maxHeight) {
					width = (width * maxHeight) / height;
					height = maxHeight;
				}

				canvas.width = width;
				canvas.height = height;

				const ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0, width, height);

				canvas.toBlob(
					(blob) => {
						resolve(new File([blob], file.name, { type }));
					},
					type,
					quality,
				);
			};

			img.onerror = reject;
			img.src = e.target.result;
		};

		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// Vue directive for lazy loading
export const vLazyImage = {
	mounted(el, binding) {
		lazyLoadImage(el, binding.value || {});
	},
};

// Preload critical images
export function preloadCriticalImages(urls) {
	return Promise.all(
		urls.map((url) => {
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = resolve;
				img.onerror = reject;
				img.src = url;
			});
		}),
	);
}
