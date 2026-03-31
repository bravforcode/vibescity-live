import { getCurrentInstance, nextTick, onUnmounted, ref, watch } from "vue";

export function useScrollSync({
	activeShopId,
	shops,
	selectFeedback,
	mobileCardScrollRef,
	onScrollDecelerate, // ✅ Track intent on deceleration
	onCenteredShopCommit,
	enableInitialCenteredShopCommit = true,
}) {
	const normalizeId = (value) => {
		if (value === null || value === undefined) return null;
		const str = String(value).trim();
		return str ? str : null;
	};

	// --- ⚙️ SCROLL & STATE MANAGEMENT ---
	const isUserScrolling = ref(false); // Checking if User is swiping
	const isProgrammaticScroll = ref(false); // Checking if App is scrolling (e.g. from Map click)

	let settleTimeout = null;
	let programmaticTimeout = null;
	let lastProgrammaticScrollEnd = 0;
	let ticking = false;
	let lastHapticAt = 0;
	const HAPTIC_INTERVAL_MS = 300;
	let cachedCardMetrics = [];
	let cachedContainerWidth = 0;
	let cachedCardCount = 0;
	let metricsFrame = 0;
	let metricsRetryTimeout = null;
	let resizeObserver = null;
	let hasCommittedInitialCenteredShop = false;
	let initialMetricRetryCount = 0;
	const MAX_INITIAL_METRIC_RETRIES = 8;

	const shouldAutoCommitInitialCenteredShop = () => {
		if (hasCommittedInitialCenteredShop) return false;
		if (!enableInitialCenteredShopCommit) return false;
		if (normalizeId(activeShopId.value)) return false;
		return Boolean(mobileCardScrollRef.value && cachedCardMetrics.length > 0);
	};

	const shouldRetryInitialMetricCapture = () => {
		if (hasCommittedInitialCenteredShop) return false;
		if (!enableInitialCenteredShopCommit) return false;
		if (normalizeId(activeShopId.value)) return false;
		return Boolean(mobileCardScrollRef.value);
	};

	const disconnectMetricObserver = () => {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
	};

	const observeMetricElements = (container, cards) => {
		disconnectMetricObserver();
		if (typeof ResizeObserver === "undefined" || !container) return;
		resizeObserver = new ResizeObserver(() => {
			if (metricsFrame) return;
			metricsFrame = window.requestAnimationFrame(() => {
				metricsFrame = 0;
				refreshCardMetrics({ rebindObservers: false });
			});
		});
		resizeObserver.observe(container);
		for (const card of cards) {
			if (!card) continue;
			resizeObserver.observe(card);
		}
	};

	// Optional: hooks
	const onScrollStart = () => {
		isUserScrolling.value = true;
	};

	const onScrollEnd = () => {
		isUserScrolling.value = false;
		if (!isProgrammaticScroll.value) {
			commitCenteredShop();
		}
	};

	const refreshCardMetrics = ({ rebindObservers = true } = {}) => {
		const container = mobileCardScrollRef.value;
		if (!container) return false;
		const cards = Array.from(container.querySelectorAll("[data-shop-id]"));
		cachedContainerWidth = container.clientWidth || 0;
		cachedCardCount = cards.length;
		if (cards.length === 0) {
			cachedCardMetrics = [];
			return false;
		}

		cachedCardMetrics = cards
			.map((card) => {
				const id = normalizeId(card.getAttribute("data-shop-id"));
				if (!id) return null;
				const width = card.offsetWidth || card.clientWidth || 1;
				const left = card.offsetLeft || 0;
				return {
					id,
					width,
					left,
					center: left + width / 2,
				};
			})
			.filter(Boolean);
		if (rebindObservers) {
			observeMetricElements(container, cards);
		}
		return cachedCardMetrics.length > 0;
	};

	const scheduleMetricRefresh = () => {
		if (metricsFrame) return;
		metricsFrame = window.requestAnimationFrame(() => {
			metricsFrame = 0;
			const hasMetrics = refreshCardMetrics();
			if (hasMetrics) {
				initialMetricRetryCount = 0;
			} else if (
				shouldRetryInitialMetricCapture() &&
				initialMetricRetryCount < MAX_INITIAL_METRIC_RETRIES
			) {
				initialMetricRetryCount += 1;
				if (metricsRetryTimeout) clearTimeout(metricsRetryTimeout);
				metricsRetryTimeout = window.setTimeout(() => {
					metricsRetryTimeout = null;
					scheduleMetricRefresh();
				}, 48);
				return;
			}
			if (shouldAutoCommitInitialCenteredShop()) {
				commitCenteredShop();
			}
		});
	};

	// 1. 🎯 Find centered card ID from cached DOM measurements
	const getCenteredCardId = () => {
		const container = mobileCardScrollRef.value;
		if (!container) return null;
		if (
			cachedCardMetrics.length === 0 ||
			!cachedContainerWidth ||
			cachedCardCount !== cachedCardMetrics.length
		) {
			if (!refreshCardMetrics()) return null;
		}

		const centerX = container.scrollLeft + cachedContainerWidth / 2;
		let closestId = null;
		let closestDistance = Infinity;

		for (const card of cachedCardMetrics) {
			const distance = Math.abs(card.center - centerX);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestId = card.id;
			}
		}

		return closestId;
	};

	// 2. 🤖 Scroll to specific card
	const scrollToCard = (shopId) => {
		const container = mobileCardScrollRef.value;
		const normalizedId = normalizeId(shopId);
		if (!container || !normalizedId) return;
		if (cachedCardMetrics.length === 0) {
			refreshCardMetrics();
		}

		const metric = cachedCardMetrics.find((card) => card.id === normalizedId);
		if (!metric) {
			// If card is not in the carousel, prevent an immediate steal from layout shifts
			lastProgrammaticScrollEnd = Date.now();
			return;
		}

		const currentCenterId = getCenteredCardId();
		if (currentCenterId && normalizeId(currentCenterId) === normalizedId)
			return;

		isProgrammaticScroll.value = true;

		if (programmaticTimeout) clearTimeout(programmaticTimeout);

		const containerWidth = container.clientWidth;
		const targetScroll = metric.left - containerWidth / 2 + metric.width / 2;

		container.scrollTo({
			left: targetScroll,
			behavior: "smooth",
		});

		programmaticTimeout = setTimeout(() => {
			isProgrammaticScroll.value = false;
			lastProgrammaticScrollEnd = Date.now();
		}, 800);
	};

	const commitCenteredShop = () => {
		const centerId = getCenteredCardId();
		if (
			!centerId ||
			normalizeId(centerId) === normalizeId(activeShopId.value)
		) {
			return;
		}

		activeShopId.value = centerId;

		const shop = shops.value.find(
			(s) => normalizeId(s.id) === normalizeId(centerId),
		);
		if (
			shop &&
			selectFeedback &&
			Date.now() - lastHapticAt >= HAPTIC_INTERVAL_MS
		) {
			selectFeedback();
			lastHapticAt = Date.now();
		}

		// Fire intent signal for prefetching
		if (onScrollDecelerate && centerId) {
			onScrollDecelerate(centerId);
		}
		if (shop && typeof onCenteredShopCommit === "function") {
			onCenteredShopCommit({
				shop,
				shopId: centerId,
				reason: hasCommittedInitialCenteredShop ? "carousel" : "startup",
			});
		}
		hasCommittedInitialCenteredShop = true;
	};

	const isCenteredCard = (shopId) =>
		normalizeId(getCenteredCardId()) === normalizeId(shopId);

	// 3. 🖐️ Main Scroll Listener
	const handleHorizontalScroll = () => {
		if (isProgrammaticScroll.value) {
			lastProgrammaticScrollEnd = Date.now();
			return;
		}
		// Grace period to absorb late momentum scroll events
		if (Date.now() - lastProgrammaticScrollEnd < 300) return;

		isUserScrolling.value = true;

		if (settleTimeout) clearTimeout(settleTimeout);
		settleTimeout = setTimeout(() => {
			isUserScrolling.value = false;
			commitCenteredShop();
		}, 400);

		if (!ticking) {
			window.requestAnimationFrame(() => {
				// Cached metrics stay warm via ResizeObserver; scroll path only reads scrollLeft.
				getCenteredCardId();
				ticking = false;
			});
			ticking = true;
		}
	};

	// 4. 👀 Watcher: Active ID Change
	watch(activeShopId, (newId) => {
		const normalizedId = normalizeId(newId);

		if (isUserScrolling.value) return;
		if (isProgrammaticScroll.value) return;

		if (normalizedId) {
			nextTick(() => {
				const currentCenter = getCenteredCardId();
				if (normalizeId(currentCenter) !== normalizedId) {
					scrollToCard(normalizedId);
				}
			});
		}
	});

	const getShopSignature = () =>
		Array.isArray(shops.value)
			? shops.value.map((shop) => normalizeId(shop?.id)).join("|")
			: "";

	watch(
		[() => mobileCardScrollRef.value, getShopSignature],
		() => {
			nextTick(() => {
				scheduleMetricRefresh();
			});
		},
		{ flush: "post", immediate: true },
	);

	if (typeof window !== "undefined") {
		window.addEventListener("resize", scheduleMetricRefresh, { passive: true });
	}

	const cleanup = () => {
		if (settleTimeout) clearTimeout(settleTimeout);
		if (programmaticTimeout) clearTimeout(programmaticTimeout);
		if (metricsRetryTimeout) clearTimeout(metricsRetryTimeout);
		if (metricsFrame) {
			window.cancelAnimationFrame(metricsFrame);
			metricsFrame = 0;
		}
		disconnectMetricObserver();
		if (typeof window !== "undefined") {
			window.removeEventListener("resize", scheduleMetricRefresh);
		}
	};

	if (getCurrentInstance()) {
		onUnmounted(cleanup);
	}

	return {
		handleHorizontalScroll,
		onScrollStart,
		onScrollEnd,
		scrollToCard,
		refreshCardMetrics,
		isCenteredCard,
		isUserScrolling,
		isProgrammaticScroll,
		cleanup,
	};
}
