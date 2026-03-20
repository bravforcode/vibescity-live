import { onUnmounted, ref } from "vue";

const now = () =>
	typeof performance !== "undefined" && typeof performance.now === "function"
		? performance.now()
		: Date.now();

export function useMapInputSampling(mapRef, mapContainerRef, options = {}) {
	const onTouchLatency =
		typeof options.onTouchLatency === "function"
			? options.onTouchLatency
			: null;
	const onCoalescedSample =
		typeof options.onCoalescedSample === "function"
			? options.onCoalescedSample
			: null;

	const touchToScrollStartMs = ref(0);
	const coalescedEventsPerFrame = ref(1);

	let pointerDownAt = 0;
	let pointerSourceActive = false;
	let pointerMoveListener = null;
	let pointerDownListener = null;
	let pointerUpListener = null;
	let moveStartListener = null;

	let frameSampleRaf = null;
	let frameEventAccumulator = 0;
	let frameSampleCount = 0;

	const reportCoalescedSample = () => {
		frameSampleRaf = null;
		if (frameSampleCount <= 0) return;
		const average = frameEventAccumulator / frameSampleCount;
		coalescedEventsPerFrame.value = Number(average.toFixed(2));
		onCoalescedSample?.({
			eventsPerFrame: coalescedEventsPerFrame.value,
			frames: frameSampleCount,
		});
		frameEventAccumulator = 0;
		frameSampleCount = 0;
	};

	const scheduleCoalescedReport = () => {
		if (frameSampleRaf !== null) return;
		frameSampleRaf = requestAnimationFrame(reportCoalescedSample);
	};

	const handlePointerDown = (event) => {
		const pointerType = String(event?.pointerType || "mouse");
		if (
			pointerType === "touch" ||
			pointerType === "pen" ||
			pointerType === "mouse"
		) {
			pointerDownAt = now();
			pointerSourceActive = true;
		}
	};

	const handlePointerUp = () => {
		pointerSourceActive = false;
		pointerDownAt = 0;
	};

	const handlePointerMove = (event) => {
		const nativeEvent = event;
		const coalesced =
			typeof nativeEvent?.getCoalescedEvents === "function"
				? nativeEvent.getCoalescedEvents()
				: null;
		const events =
			Array.isArray(coalesced) && coalesced.length ? coalesced : [nativeEvent];
		frameEventAccumulator += events.length;
		frameSampleCount += 1;
		scheduleCoalescedReport();
	};

	const handleMapMoveStart = () => {
		if (!pointerSourceActive || !pointerDownAt) return;
		const latency = Math.max(0, now() - pointerDownAt);
		touchToScrollStartMs.value = Number(latency.toFixed(2));
		onTouchLatency?.(touchToScrollStartMs.value);
		pointerSourceActive = false;
		pointerDownAt = 0;
	};

	const bind = () => {
		const mapInstance = mapRef?.value;
		if (!mapInstance) return;
		const canvas = mapInstance.getCanvas?.() || mapContainerRef?.value;
		if (!canvas) return;
		if (pointerMoveListener) return;

		pointerMoveListener = (event) => handlePointerMove(event);
		pointerDownListener = (event) => handlePointerDown(event);
		pointerUpListener = () => handlePointerUp();

		canvas.addEventListener("pointermove", pointerMoveListener, {
			passive: true,
		});
		canvas.addEventListener("pointerdown", pointerDownListener, {
			passive: true,
		});
		canvas.addEventListener("pointerup", pointerUpListener, { passive: true });
		canvas.addEventListener("pointercancel", pointerUpListener, {
			passive: true,
		});

		moveStartListener = () => handleMapMoveStart();
		mapInstance.on("movestart", moveStartListener);
	};

	const unbind = () => {
		const mapInstance = mapRef?.value;
		const canvas = mapInstance?.getCanvas?.() || mapContainerRef?.value;

		if (canvas && pointerMoveListener) {
			canvas.removeEventListener("pointermove", pointerMoveListener);
		}
		if (canvas && pointerDownListener) {
			canvas.removeEventListener("pointerdown", pointerDownListener);
		}
		if (canvas && pointerUpListener) {
			canvas.removeEventListener("pointerup", pointerUpListener);
			canvas.removeEventListener("pointercancel", pointerUpListener);
		}
		if (mapInstance && moveStartListener) {
			mapInstance.off("movestart", moveStartListener);
		}
		pointerMoveListener = null;
		pointerDownListener = null;
		pointerUpListener = null;
		moveStartListener = null;
		pointerSourceActive = false;
		pointerDownAt = 0;
		if (frameSampleRaf !== null) {
			cancelAnimationFrame(frameSampleRaf);
			frameSampleRaf = null;
		}
		frameEventAccumulator = 0;
		frameSampleCount = 0;
	};

	onUnmounted(() => {
		unbind();
	});

	return {
		bind,
		unbind,
		touchToScrollStartMs,
		coalescedEventsPerFrame,
	};
}
