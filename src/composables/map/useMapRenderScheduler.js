import { onUnmounted, ref } from "vue";

/**
 * Batches map source updates into animation frames to reduce layout thrash/jank.
 */
export function useMapRenderScheduler(mapRef, options = {}) {
	const frameBudgetMs = Number(options.frameBudgetMs || 16.7);
	const trackLongTasks = options.trackLongTasks !== false;
	const frameBudgetMissCount = ref(0);
	const longTaskCount = ref(0);

	let rafId = null;
	let lastFrameAt = 0;
	let longTaskObserver = null;
	const pendingSourceUpdates = new Map();

	const flush = (ts) => {
		rafId = null;
		if (lastFrameAt > 0 && ts - lastFrameAt > frameBudgetMs * 2) {
			frameBudgetMissCount.value += 1;
		}
		lastFrameAt = ts;

		const mapInstance = mapRef?.value;
		if (!mapInstance) {
			pendingSourceUpdates.clear();
			return;
		}

		for (const [sourceId, data] of pendingSourceUpdates.entries()) {
			try {
				const source = mapInstance.getSource(sourceId);
				source?.setData?.(data);
			} catch {
				// Ignore transient source/style races during style switches.
			}
		}
		pendingSourceUpdates.clear();
	};

	const scheduleSourceUpdate = (sourceId, data) => {
		if (!sourceId || !data) return;
		pendingSourceUpdates.set(sourceId, data);
		if (rafId !== null) return;
		rafId = requestAnimationFrame(flush);
	};

	const flushNow = () => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		flush(performance.now());
	};

	if (
		trackLongTasks &&
		typeof PerformanceObserver !== "undefined" &&
		PerformanceObserver.supportedEntryTypes?.includes("longtask")
	) {
		try {
			longTaskObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				if (entries?.length) {
					longTaskCount.value += entries.length;
				}
			});
			longTaskObserver.observe({ type: "longtask", buffered: true });
		} catch {
			longTaskObserver = null;
		}
	}

	onUnmounted(() => {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		pendingSourceUpdates.clear();
		longTaskObserver?.disconnect?.();
		longTaskObserver = null;
	});

	return {
		scheduleSourceUpdate,
		flushNow,
		frameBudgetMissCount,
		longTaskCount,
	};
}
