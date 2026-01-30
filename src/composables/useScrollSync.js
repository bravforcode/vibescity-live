import { nextTick, ref, watch } from "vue";

export function useScrollSync({
    activeShopId,
    shops,
    mapRef,
    smoothFlyTo,
    selectFeedback,
    mobileCardScrollRef
}) {
    // --- ⚙️ SCROLL & STATE MANAGEMENT ---
    const isUserScrolling = ref(false); // Checking if User is swiping
    const isProgrammaticScroll = ref(false); // Checking if App is scrolling (e.g. from Map click)

    let scrollTimeout = null;
    let ticking = false;

    // Optional: hooks
    const onScrollStart = () => {
        isUserScrolling.value = true;
    };

    const onScrollEnd = () => {
        isUserScrolling.value = false;
    };

    // 1. 🎯 Find centered card ID
    const getCenteredCardId = () => {
        const container = mobileCardScrollRef.value;
        if (!container) return null;

        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;

        const cards = container.querySelectorAll("[data-shop-id]");
        let closestCard = null;
        let minDiff = Infinity;

        cards.forEach((card) => {
            const cardRect = card.getBoundingClientRect();
            const cardCenter = cardRect.left + cardRect.width / 2;
            const diff = Math.abs(containerCenter - cardCenter);

            if (diff < minDiff && diff < 100) {
                minDiff = diff;
                closestCard = card;
            }
        });

        return closestCard
            ? Number(closestCard.getAttribute("data-shop-id"))
            : null;
    };

    // 2. 🤖 Scroll to specific card
    const scrollToCard = (shopId) => {
        const container = mobileCardScrollRef.value;
        if (!container || !shopId) return;

        const card = container.querySelector(`[data-shop-id="${shopId}"]`);
        if (!card) return;

        const currentCenterId = getCenteredCardId();
        if (currentCenterId === Number(shopId)) return;

        isProgrammaticScroll.value = true;

        if (scrollTimeout) clearTimeout(scrollTimeout);

        const containerWidth = container.clientWidth;
        const cardLeft = card.offsetLeft;
        const cardWidth = card.offsetWidth;
        const targetScroll = cardLeft - containerWidth / 2 + cardWidth / 2;

        container.scrollTo({
            left: targetScroll,
            behavior: "smooth",
        });

        scrollTimeout = setTimeout(() => {
            isProgrammaticScroll.value = false;
        }, 800);
    };

    // 3. 🖐️ Main Scroll Listener
    const handleHorizontalScroll = () => {
        if (isProgrammaticScroll.value) return;

        isUserScrolling.value = true;

        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isUserScrolling.value = false;
        }, 150);

        if (!ticking) {
            window.requestAnimationFrame(() => {
                const centerId = getCenteredCardId();

                if (centerId && centerId !== Number(activeShopId.value)) {
                    // Update ID directly (parent should bind this)
                    activeShopId.value = centerId;

                    // Sync Map
                    const shop = shops.value.find(
                        (s) => Number(s.id) === Number(centerId),
                    );
                    if (shop && mapRef.value && typeof smoothFlyTo === 'function') {
                        smoothFlyTo([shop.lat, shop.lng]);
                        if (selectFeedback) selectFeedback(); // Optional haptic
                    }
                }
                ticking = false;
            });
            ticking = true;
        }
    };

    // 4. 👀 Watcher: Active ID Change
    watch(activeShopId, (newId) => {
        if (newId) {
            const url = new URL(window.location);
            url.searchParams.set("shop", newId);
            window.history.replaceState({}, "", url);
        }

        if (isUserScrolling.value) return;
        if (isProgrammaticScroll.value) return;

        if (newId) {
            nextTick(() => {
                const currentCenter = getCenteredCardId();
                if (currentCenter !== Number(newId)) {
                    scrollToCard(newId);
                }
            });
        }
    });

    return {
        handleHorizontalScroll,
        onScrollStart,
        onScrollEnd,
        scrollToCard,
        isUserScrolling,
        isProgrammaticScroll
    };
}
