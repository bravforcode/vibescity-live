// src/composables/map/useNeonPinsLayer.js
// Neon pin sign DOM overlay — viewport-clipped, density-limited, flyTo wired

import { h, onUnmounted, ref, render, watch } from "vue";
import NeonPinSign from "../../components/map/NeonPinSign.vue";

import { Z } from "../../constants/zIndex";

// Show at most this many signs at once to prevent overlap/perf issues
const MAX_VISIBLE = 20;
// Minimum pixel distance between any two sign centers
// Increased from 70 → 115px so neon signs (typically 100-130px wide) never overlap
const MIN_PX_GAP = 115;

export function useNeonPinsLayer(
	mapRef,
	shopsRef,
	containerRef,
	{ onPinClick, highlightedShopId, activePopupShopId } = {},
) {
	const showNeonPins = ref(true);
	const selectedShopId = ref(null);
	const pinInstances = new Map(); // shopId → { el, unmount, overlayType }
	let overlayEl = null;
	let selectedOverlayEl = null;
	let overlayObserver = null;
	let mapMoveCleanup = null;
	let detailModalOpen = false;
	const resolveHighlightedId = () =>
		String(
			typeof highlightedShopId === "function"
				? highlightedShopId()
				: (highlightedShopId?.value ?? ""),
		);
	const resolvePreviewPopupId = () =>
		String(
			typeof activePopupShopId === "function"
				? activePopupShopId()
				: (activePopupShopId?.value ?? ""),
		);
	const hasDetailModalOpen = () =>
		typeof document !== "undefined" &&
		Boolean(document.querySelector("[data-testid='vibe-modal']"));
	const resolveFocusedId = () =>
		resolvePreviewPopupId() || resolveHighlightedId();
	const getShopsSignature = () =>
		Array.isArray(shopsRef.value)
			? shopsRef.value
					.map(
						(shop) =>
							`${shop?.id ?? ""}:${shop?.lat ?? ""}:${shop?.lng ?? ""}:${shop?.isLive ? 1 : 0}`,
					)
					.join("|")
			: "";

	// ── Viewport + density filter ────────────────────────────────────────────
	const getVisibleShops = () => {
		if (!showNeonPins.value || !shopsRef.value || !mapRef.value) return [];

		const map = mapRef.value;
		const zoom = map.getZoom?.() ?? 0;
		const highlightId = resolveHighlightedId();
		const previewPopupId = resolvePreviewPopupId();
		const focusId = resolveFocusedId();
		const modalOpen = hasDetailModalOpen();
		if (modalOpen) {
			if (!highlightId) return [];
			return shopsRef.value.filter(
				(shop) => String(shop?.id ?? "") === String(highlightId),
			);
		}
		if (previewPopupId) {
			return shopsRef.value.filter(
				(shop) => String(shop?.id ?? "") === String(previewPopupId),
			);
		}
		if (zoom < 13 && !highlightId) return []; // too zoomed out — too many pins

		// Get map canvas bounds in pixels for projection checks
		const canvas = map.getCanvas?.();
		const W = canvas?.width ?? 375;
		const H = canvas?.height ?? 667;

		// Project each shop and keep only those inside the canvas
		const candidates = [];
		for (const shop of shopsRef.value) {
			const shopId = String(shop?.id ?? "");
			if (zoom < 13 && shopId !== focusId) continue;
			if (!shop.lat || !shop.lng) continue;
			try {
				const pt = map.project([shop.lng, shop.lat]);
				if (pt.x < -20 || pt.x > W + 20 || pt.y < -20 || pt.y > H + 20)
					continue;
				candidates.push({ shop, x: pt.x, y: pt.y });
			} catch {
				/* skip bad coords */
			}
		}

		// Priority:
		// 1. Highlighted (carousel-center) shop — always first
		// 2. Live shops
		// 3. Closest to screen center
		const cx = W / 2,
			cy = H / 2;
		candidates.sort((a, b) => {
			const aIsHighlighted = String(a.shop.id) === focusId;
			const bIsHighlighted = String(b.shop.id) === focusId;
			if (aIsHighlighted !== bIsHighlighted) return aIsHighlighted ? -1 : 1;
			if (a.shop.isLive !== b.shop.isLive) return a.shop.isLive ? -1 : 1;
			const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
			const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
			return da - db;
		});

		// Greedy spatial spread: reject if too close to already-accepted pin.
		// Exception: highlighted shop is always accepted regardless of proximity.
		const accepted = [];
		const placed = [];
		for (const c of candidates) {
			if (accepted.length >= MAX_VISIBLE) break;
			const isHighlighted = String(c.shop.id) === focusId;
			const tooClose =
				!isHighlighted &&
				placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_PX_GAP);
			if (!tooClose) {
				accepted.push(c.shop);
				placed.push({ x: c.x, y: c.y });
			}
		}
		return accepted;
	};

	// ── DOM overlay ─────────────────────────────────────────────────────────
	const syncSelectedOverlayLayer = () => {
		if (!selectedOverlayEl) return;
		const hasDetailModal = hasDetailModalOpen();
		selectedOverlayEl.style.zIndex = String(
			hasDetailModal ? Z.MODAL_TOP + 5 : Z.MAPBOX_POPUP + 5,
		);
	};

	const ensureOverlay = () => {
		if (overlayEl || selectedOverlayEl || !containerRef.value) return;
		overlayEl = document.createElement("div");
		overlayEl.dataset.overlayType = "regular";
		overlayEl.style.cssText =
			"position:absolute;inset:0;pointer-events:none;z-index:15;overflow:hidden;";
		containerRef.value.appendChild(overlayEl);

		selectedOverlayEl = document.createElement("div");
		selectedOverlayEl.dataset.overlayType = "selected";
		selectedOverlayEl.style.cssText =
			"position:fixed;inset:0;pointer-events:none;overflow:visible;";
		document.body.appendChild(selectedOverlayEl);
		detailModalOpen = hasDetailModalOpen();
		syncSelectedOverlayLayer();
		if (typeof MutationObserver === "function" && !overlayObserver) {
			overlayObserver = new MutationObserver(() => {
				const nextDetailModalOpen = hasDetailModalOpen();
				if (nextDetailModalOpen !== detailModalOpen) {
					detailModalOpen = nextDetailModalOpen;
					syncPins();
				}
				syncSelectedOverlayLayer();
			});
			overlayObserver.observe(document.body, {
				childList: true,
				subtree: true,
			});
		}
	};

	const project = (shop) => {
		try {
			return mapRef.value?.project([shop.lng, shop.lat]);
		} catch {
			return null;
		}
	};

	const mountPin = (shop) => {
		if (!overlayEl && !selectedOverlayEl) return;
		unmountPin(shop.id); // remove stale first

		const isFocused = String(shop.id) === resolveFocusedId();
		const targetOverlay = isFocused ? selectedOverlayEl : overlayEl;
		if (!targetOverlay) return;

		const el = document.createElement("div");
		// Use GPU-composited transform-only positioning for crisp sub-pixel rendering
		el.style.cssText =
			"position:absolute;left:0;top:0;pointer-events:auto;will-change:transform;";
		el.dataset.overlayType = isFocused ? "selected" : "regular";
		targetOverlay.appendChild(el);

		const vnode = h(NeonPinSign, {
			shop,
			isVisible: true,
			isSelected:
				String(shop.id) ===
				String(
					selectedShopId.value ||
						resolvePreviewPopupId() ||
						resolveHighlightedId(),
				),
			onClick: (s) => handlePinClick(s),
		});
		render(vnode, el);
		pinInstances.set(shop.id, {
			el,
			unmount: () => render(null, el),
			overlayType: el.dataset.overlayType,
		});
		positionPin(shop.id, shop);
	};

	const positionPin = (id, shop) => {
		const entry = pinInstances.get(id);
		if (!entry) return;
		const pt = project(shop);
		if (!pt) return;
		const isSelectedOverlay = entry.overlayType === "selected";
		const containerRect = containerRef.value?.getBoundingClientRect?.();
		// Single GPU-accelerated transform — avoids sub-pixel jitter caused by
		// mixing left/top + translate. Anchor at bottom-center of the sign.
		const el = entry.el;
		const w = el.offsetWidth || 0;
		const h = el.offsetHeight || 0;
		const x =
			(isSelectedOverlay ? (containerRect?.left ?? 0) : 0) + pt.x - w / 2;
		const y = (isSelectedOverlay ? (containerRect?.top ?? 0) : 0) + pt.y - h;
		// When detail modal is open, clamp Y so the sign floats above the modal surface.
		// Sign top edge = finalY, bottom edge = finalY + h. Ensure: finalY + h <= modalTop - gap.
		let finalY = y;
		if (isSelectedOverlay && hasDetailModalOpen()) {
			const modalSurface = document.querySelector(
				"[data-testid='vibe-modal-surface']",
			);
			if (modalSurface) {
				const modalTop = modalSurface.getBoundingClientRect().top;
				const gap = 16;
				const maxY = modalTop - gap - h;
				if (finalY > maxY) finalY = Math.max(8, maxY);
			}
		}
		const focusId = resolveFocusedId();
		el.style.zIndex = String(id) === focusId ? "30" : "1";
		el.style.transform = `translate3d(${x}px, ${finalY}px, 0)`;
	};

	const unmountPin = (id) => {
		const entry = pinInstances.get(id);
		if (!entry) return;
		entry.unmount();
		entry.el.remove();
		pinInstances.delete(id);
	};

	const clearAllPins = () => {
		for (const [id] of [...pinInstances]) unmountPin(id);
	};

	const repositionAll = () => {
		// Also re-evaluate visibility on zoom/move
		syncPins();
	};

	const syncPins = () => {
		if (!showNeonPins.value) {
			clearAllPins();
			return;
		}
		ensureOverlay();

		const visibleShops = getVisibleShops();
		const current = new Set(visibleShops.map((s) => s.id));
		// Remove shops no longer visible
		for (const [id] of [...pinInstances]) {
			if (!current.has(id)) unmountPin(id);
		}
		// Add/update visible shops
		for (const shop of visibleShops) {
			if (pinInstances.has(shop.id)) {
				const entry = pinInstances.get(shop.id);
				const expectedOverlayType =
					String(shop.id) === resolveFocusedId() ? "selected" : "regular";
				if (entry?.overlayType !== expectedOverlayType) {
					unmountPin(shop.id);
					mountPin(shop);
					continue;
				}
				positionPin(shop.id, shop); // just reposition
			} else {
				mountPin(shop); // new pin
			}
		}
	};

	// ── Click → flyTo ────────────────────────────────────────────────────────
	const handlePinClick = (shop) => {
		selectedShopId.value = shop.id;
		onPinClick?.(shop);
	};

	// ── Map listeners ────────────────────────────────────────────────────────
	const attachMapListener = (map) => {
		if (mapMoveCleanup) return;
		map.on("move", repositionAll);
		map.on("zoom", repositionAll);
		mapMoveCleanup = () => {
			map.off("move", repositionAll);
			map.off("zoom", repositionAll);
		};
	};

	watch(
		() => mapRef.value,
		(map) => {
			if (map) {
				attachMapListener(map);
				syncPins();
			}
		},
		{ immediate: true },
	);

	watch(
		() => `${resolveHighlightedId()}|${resolvePreviewPopupId()}`,
		(nextState) => {
			const [nextHighlightedId = "", nextPreviewPopupId = ""] =
				String(nextState).split("|");
			selectedShopId.value = nextPreviewPopupId || nextHighlightedId || null;
			syncPins();
		},
		{ immediate: true },
	);

	watch(showNeonPins, (enabled) => {
		ensureOverlay();
		if (overlayEl) {
			overlayEl.style.opacity = enabled ? "1" : "0";
			overlayEl.style.pointerEvents = enabled ? "auto" : "none";
		}
		if (selectedOverlayEl) {
			selectedOverlayEl.style.opacity = enabled ? "1" : "0";
			selectedOverlayEl.style.pointerEvents = enabled ? "auto" : "none";
		}
		syncPins();
	});

	// Re-sync when shops list changes
	watch(getShopsSignature, () => syncPins(), { immediate: true });

	onUnmounted(() => {
		mapMoveCleanup?.();
		clearAllPins();
		overlayObserver?.disconnect?.();
		overlayObserver = null;
		overlayEl?.remove();
		selectedOverlayEl?.remove();
		overlayEl = null;
		selectedOverlayEl = null;
	});

	return {
		showNeonPins,
		toggleNeonPins: (val = !showNeonPins.value) => {
			showNeonPins.value = val;
		},
		selectedShopId,
		/** Call this when carousel center shop changes */
		syncPins,
	};
}
