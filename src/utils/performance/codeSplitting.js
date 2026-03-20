/**
 * Code Splitting & Lazy Loading Utilities
 *
 * Features:
 * - Dynamic imports
 * - Route-based splitting
 * - Component lazy loading
 * - Preloading strategies
 * - Loading states
 */

import { defineAsyncComponent, h } from "vue";

// Lazy load component with loading state
export function lazyLoadComponent(importFn, options = {}) {
	const {
		loadingComponent = null,
		errorComponent = null,
		delay = 200,
		timeout = 30000,
		onError = null,
	} = options;

	return defineAsyncComponent({
		loader: importFn,
		loadingComponent,
		errorComponent,
		delay,
		timeout,
		onError: (error, retry, fail, attempts) => {
			if (onError) {
				onError(error, retry, fail, attempts);
			}

			// Auto-retry up to 3 times
			if (attempts <= 3) {
				console.log(`[LazyLoad] Retrying... (${attempts}/3)`);
				setTimeout(retry, 1000 * attempts);
			} else {
				console.error("[LazyLoad] Failed after 3 attempts");
				fail();
			}
		},
	});
}

// Lazy load route component
export function lazyLoadRoute(importFn) {
	return () => ({
		component: importFn(),
		loading: {
			name: "RouteLoading",
			render() {
				return h("div", { class: "route-loading" }, [
					h("div", { class: "spinner" }),
					h("p", "กำลังโหลด..."),
				]);
			},
		},
		error: {
			name: "RouteError",
			render() {
				return h("div", { class: "route-error" }, [
					h("h2", "เกิดข้อผิดพลาด"),
					h("p", "ไม่สามารถโหลดหน้านี้ได้"),
					h(
						"button",
						{
							onClick: () => window.location.reload(),
						},
						"ลองอีกครั้ง",
					),
				]);
			},
		},
		delay: 200,
		timeout: 30000,
	});
}

// Preload component
export function preloadComponent(importFn) {
	return importFn();
}

// Preload route
export function preloadRoute(routeName, router) {
	const route = router.getRoutes().find((r) => r.name === routeName);
	if (route?.component) {
		return route.component();
	}
}

// Prefetch on hover
export function prefetchOnHover(element, importFn) {
	let prefetched = false;

	const prefetch = () => {
		if (prefetched) return;
		prefetched = true;
		importFn();
	};

	element.addEventListener("mouseenter", prefetch, { once: true });
	element.addEventListener("touchstart", prefetch, { once: true });
}

// Prefetch on visible
export function prefetchOnVisible(element, importFn) {
	if (!("IntersectionObserver" in window)) {
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					importFn();
					observer.disconnect();
				}
			});
		},
		{ rootMargin: "50px" },
	);

	observer.observe(element);
}

// Prefetch on idle
export function prefetchOnIdle(importFn) {
	if ("requestIdleCallback" in window) {
		requestIdleCallback(() => importFn());
	} else {
		setTimeout(() => importFn(), 1);
	}
}

// Chunk loading strategy
export class ChunkLoadingStrategy {
	constructor() {
		this.loadedChunks = new Set();
		this.loadingChunks = new Map();
	}

	// Load chunk
	async loadChunk(chunkName, importFn) {
		// Already loaded
		if (this.loadedChunks.has(chunkName)) {
			return;
		}

		// Currently loading
		if (this.loadingChunks.has(chunkName)) {
			return this.loadingChunks.get(chunkName);
		}

		// Start loading
		const promise = importFn()
			.then((module) => {
				this.loadedChunks.add(chunkName);
				this.loadingChunks.delete(chunkName);
				return module;
			})
			.catch((error) => {
				this.loadingChunks.delete(chunkName);
				throw error;
			});

		this.loadingChunks.set(chunkName, promise);
		return promise;
	}

	// Preload chunks
	async preloadChunks(chunks) {
		return Promise.all(
			chunks.map(({ name, importFn }) => this.loadChunk(name, importFn)),
		);
	}

	// Is loaded
	isLoaded(chunkName) {
		return this.loadedChunks.has(chunkName);
	}

	// Is loading
	isLoading(chunkName) {
		return this.loadingChunks.has(chunkName);
	}
}

// Route prefetching directive
export const vPrefetch = {
	mounted(el, binding) {
		const { value, modifiers } = binding;

		if (!value) return;

		if (modifiers.hover) {
			prefetchOnHover(el, value);
		} else if (modifiers.visible) {
			prefetchOnVisible(el, value);
		} else if (modifiers.idle) {
			prefetchOnIdle(value);
		} else {
			// Default: prefetch immediately
			value();
		}
	},
};

// Bundle analyzer helper
export function analyzeBundleSize() {
	if (!performance.getEntriesByType) return null;

	const resources = performance.getEntriesByType("resource");
	const scripts = resources.filter((r) => r.initiatorType === "script");

	const analysis = {
		totalSize: 0,
		totalDuration: 0,
		scripts: [],
	};

	for (const script of scripts) {
		const size = script.transferSize || 0;
		const duration = script.duration || 0;

		analysis.totalSize += size;
		analysis.totalDuration += duration;
		analysis.scripts.push({
			name: script.name,
			size,
			duration,
		});
	}

	// Sort by size
	analysis.scripts.sort((a, b) => b.size - a.size);

	return analysis;
}

// Singleton instance
let strategyInstance = null;

export function useChunkLoadingStrategy() {
	if (!strategyInstance) {
		strategyInstance = new ChunkLoadingStrategy();
	}
	return strategyInstance;
}
