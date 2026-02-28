import { ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import { useHardwareInfo } from "./useHardwareInfo";
import { useIntentPredictor } from "./useIntentPredictor";

/**
 * ⚡ Prefetch Engine
 * Consumes predictions from `useIntentPredictor` and aggressively preloads data/images into browser layer.
 * Zero main-thread blocking via `requestIdleCallback`.
 */

// Cache map to prevent duplicate requests
const prefetchCache = new Map();
const TTL_MS = 60_000; // 60 seconds

// Semaphore for concurrent tracking
let activePrefetches = 0;
const MAX_CONCURRENT = 3;

// Global AbortController for cancelation
let globalAbort = new AbortController();

const prefetchImage = (url) => {
	if (!url) return;
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = resolve;
		img.onerror = resolve; // Ignore errors, it's just a prefetch
		img.src = url;
	});
};

const prefetchVenueData = async (id, signal) => {
	if (!id) return;
	try {
		await supabase.from("shops").select("*").eq("id", id).single().abortSignal(signal);
		// Note: Supabase JS client handles caching in some versions,
		// but even just making the fetch Warms the browser's disk/network cache.
		// For true local-first, you would insert into IndexedDB here if needed.
	} catch {
		// silently fail
	}
};

const executePrefetch = async (id) => {
	if (activePrefetches >= MAX_CONCURRENT) return; // Too busy
	if (prefetchCache.has(id)) {
		const age = Date.now() - prefetchCache.get(id);
		if (age < TTL_MS) return; // Already cached and fresh
	}

	activePrefetches++;
	prefetchCache.set(id, Date.now());

	try {
		// Use requestIdleCallback so we NEVER block the main thread for animations
		const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
		idle(async () => {
			const signal = globalAbort.signal;
			if (signal.aborted) return;

			// 1. Fetch data
			await prefetchVenueData(id, signal);

			// 2. We don't have the image URL directly here unless we load the data first.
			// Supabase request warms the cache. If we had an image URL array, we'd prefetch them.

			if (import.meta.env.DEV) {
				console.log(`[Prefetch] Warmed cache for venue ${id}`);
			}
		});
	} finally {
		// Decrement even if async work is queued, slightly inaccurate but prevents deadlocks
		setTimeout(() => { activePrefetches--; }, 2000);
	}
};

export function usePrefetchEngine() {
	const { topPredictions } = useIntentPredictor();
	const { isSlowNetwork, isLowPowerMode } = useHardwareInfo();

	const isEnabled = ref(false);

	// Cancel all ongoing speculative work
	const cancelAll = () => {
		globalAbort.abort();
		globalAbort = new AbortController(); // Create new token for future
		activePrefetches = 0;
	};

	const startEngine = () => {
		// Respect user settings and hardware limits
		if (isSlowNetwork.value || isLowPowerMode.value) return;

		// If browser supports navigator.connection.saveData, respect it!
		if (navigator.connection && navigator.connection.saveData) {
			if (import.meta.env.DEV) console.log("[Prefetch] Disabled: Save-Data header is on.");
			return;
		}

		isEnabled.value = true;
	};

	const stopEngine = () => {
		isEnabled.value = false;
		cancelAll();
	};

	// The magic loop
	watch(topPredictions, (predictions) => {
		if (!isEnabled.value) return;
		for (const id of predictions) {
			executePrefetch(id);
		}
	});

	return {
		startEngine,
		stopEngine,
		cancelAll,
		prefetchImage,
		isEnabled
	};
}
