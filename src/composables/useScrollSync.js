import { nextTick, ref, watch } from "vue";

export function useScrollSync({
	activeShopId,
	shops,
	mapRef,
	smoothFlyTo,
	selectFeedback,
	mobileCardScrollRef,
	onScrollDecelerate, // ✅ Track intent on deceleration
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
	let cachedCardWidth = 0;
	let cachedCardGap = 0;
	let cachedFirstCardOffset = 0;
	let cachedCardIds = [];

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

	const refreshCardMetrics = () => {
		const container = mobileCardScrollRef.value;
		if (!container) return false;
		const cards = container.querySelectorAll("[data-shop-id]");
		if (cards.length === 0) {
			cachedCardIds = [];
			return false;
		}

		const firstCard = cards[0];
		const secondCard = cards[1];
		const firstWidth = firstCard.offsetWidth || firstCard.clientWidth || 1;
		const firstOffset = firstCard.offsetLeft || 0;
		const secondOffset = secondCard?.offsetLeft ?? firstOffset + firstWidth;
		const gap = Math.max(0, secondOffset - firstOffset - firstWidth);

		cachedCardWidth = firstWidth;
		cachedCardGap = gap;
		cachedFirstCardOffset = firstOffset;
		cachedCardIds = Array.from(cards)
			.map((card) => normalizeId(card.getAttribute("data-shop-id")))
			.filter(Boolean);
		return true;
	};

	// 1. 🎯 Find centered card ID (fast path, no full-card loop per frame)
	const getCenteredCardId = () => {
		const container = mobileCardScrollRef.value;
		if (!container) return null;
		if (!cachedCardIds.length || !cachedCardWidth) {
			if (!refreshCardMetrics()) return null;
		}

		const step = cachedCardWidth + cachedCardGap || 1;
		const centerX = container.scrollLeft + container.clientWidth / 2;
		const relative = centerX - cachedFirstCardOffset - cachedCardWidth / 2;
		const rawIndex = Math.round(relative / step);
		const maxIndex = cachedCardIds.length - 1;
		const index = Math.min(Math.max(rawIndex, 0), maxIndex);
		return cachedCardIds[index] ?? null;
	};

	// 2. 🤖 Scroll to specific card
	const scrollToCard = (shopId) => {
		const container = mobileCardScrollRef.value;
		const normalizedId = normalizeId(shopId);
		if (!container || !normalizedId) return;
		refreshCardMetrics();

		const card = container.querySelector(`[data-shop-id="${normalizedId}"]`);
		if (!card) {
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
		const cardLeft = card.offsetLeft;
		const cardWidth = card.offsetWidth;
		const targetScroll = cardLeft - containerWidth / 2 + cardWidth / 2;

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
		if (shop && mapRef.value && typeof smoothFlyTo === "function") {
			smoothFlyTo([shop.lat, shop.lng]);
			if (selectFeedback && Date.now() - lastHapticAt >= HAPTIC_INTERVAL_MS) {
				selectFeedback();
				lastHapticAt = Date.now();
			}
		}

		// Fire intent signal for prefetching
		if (onScrollDecelerate && centerId) {
			onScrollDecelerate(centerId);
		}
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

		if (!cachedCardIds.length) refreshCardMetrics();

		isUserScrolling.value = true;

		if (settleTimeout) clearTimeout(settleTimeout);
		settleTimeout = setTimeout(() => {
			isUserScrolling.value = false;
			commitCenteredShop();
		}, 400);

		if (!ticking) {
			window.requestAnimationFrame(() => {
				// keep metrics warm while scrolling; commit happens on settle.
				getCenteredCardId();
				ticking = false;
			});
			ticking = true;
		}
	};

	// 4. 👀 Watcher: Active ID Change
	watch(activeShopId, (newId) => {
		const normalizedId = normalizeId(newId);
		if (normalizedId) {
			const url = new URL(window.location);
			url.searchParams.set("shop", normalizedId);
			window.history.replaceState({}, "", url);
		}

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

	return {
		handleHorizontalScroll,
		onScrollStart,
		onScrollEnd,
		scrollToCard,
		isCenteredCard,
		isUserScrolling,
		isProgrammaticScroll,
	};
}
