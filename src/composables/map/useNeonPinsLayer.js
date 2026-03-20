// src/composables/map/useNeonPinsLayer.js
// Neon pin sign DOM overlay — viewport-clipped, density-limited, flyTo wired

import { computed, h, onUnmounted, ref, render, watch } from "vue";

let NeonPinSignComponent = null;
const pinLoadsInFlight = new Set();
const loadNeonPinSign = async () => {
	if (NeonPinSignComponent) return NeonPinSignComponent;
	const mod = await import("../../components/map/NeonPinSign.vue");
	NeonPinSignComponent = mod.default;
	return NeonPinSignComponent;
};

// Show at most this many signs at once to prevent overlap/perf issues
const MAX_VISIBLE = 20;
// Minimum pixel distance between any two sign centers
// Increased from 70 → 115px so neon signs (typically 100-130px wide) never overlap
const MIN_PX_GAP = 115;

export function useNeonPinsLayer(
	mapRef,
	shopsRef,
	containerRef,
	{ onPinClick, highlightedShopId } = {},
) {
	const showNeonPins = ref(true);
	const selectedShopId = ref(null);
	const pinInstances = new Map(); // shopId → { el, unmount }
	let overlayEl = null;
	let mapMoveCleanup = null;

	// ── Viewport + density filter ────────────────────────────────────────────
	const visibleShops = computed(() => {
		if (!showNeonPins.value || !shopsRef.value || !mapRef.value) return [];

		const map = mapRef.value;
		const zoom = map.getZoom?.() ?? 0;
		if (zoom < 13) return []; // too zoomed out — too many pins

		// Get map canvas bounds in pixels for projection checks
		const canvas = map.getCanvas?.();
		const W = canvas?.width ?? 375;
		const H = canvas?.height ?? 667;

		// Resolve the current highlighted (carousel-center) shop id
		const highlightId = String(
			typeof highlightedShopId === "function"
				? highlightedShopId()
				: (highlightedShopId?.value ?? ""),
		);

		// Project each shop and keep only those inside the canvas
		const candidates = [];
		for (const shop of shopsRef.value) {
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
			const aIsHighlighted = String(a.shop.id) === highlightId;
			const bIsHighlighted = String(b.shop.id) === highlightId;
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
			const isHighlighted = String(c.shop.id) === highlightId;
			const tooClose =
				!isHighlighted &&
				placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_PX_GAP);
			if (!tooClose) {
				accepted.push(c.shop);
				placed.push({ x: c.x, y: c.y });
			}
		}
		return accepted;
	});

	// ── DOM overlay ─────────────────────────────────────────────────────────
	const ensureOverlay = () => {
		if (overlayEl || !containerRef.value) return;
		overlayEl = document.createElement("div");
		overlayEl.style.cssText =
			"position:absolute;inset:0;pointer-events:none;z-index:15;overflow:hidden;";
		containerRef.value.appendChild(overlayEl);
	};

	const project = (shop) => {
		try {
			return mapRef.value?.project([shop.lng, shop.lat]);
		} catch {
			return null;
		}
	};

	const mountPin = async (shop) => {
		if (!overlayEl || pinLoadsInFlight.has(shop.id)) return;
		pinLoadsInFlight.add(shop.id);
		const NeonPinSign = await loadNeonPinSign().catch(() => null);
		pinLoadsInFlight.delete(shop.id);
		if (!overlayEl || !NeonPinSign) return;
		unmountPin(shop.id); // remove stale first

		const el = document.createElement("div");
		// Use GPU-composited transform-only positioning for crisp sub-pixel rendering
		el.style.cssText =
			"position:absolute;left:0;top:0;pointer-events:auto;will-change:transform;";
		overlayEl.appendChild(el);

		const vnode = h(NeonPinSign, {
			shop,
			isVisible: true,
			isSelected: shop.id === selectedShopId.value,
			onClick: (s) => handlePinClick(s),
		});
		render(vnode, el);
		pinInstances.set(shop.id, { el, unmount: () => render(null, el) });
		positionPin(shop.id, shop);
	};

	const positionPin = (id, shop) => {
		const entry = pinInstances.get(id);
		if (!entry) return;
		const pt = project(shop);
		if (!pt) return;
		// Single GPU-accelerated transform — avoids sub-pixel jitter caused by
		// mixing left/top + translate. Anchor at bottom-center of the sign.
		const el = entry.el;
		const w = el.offsetWidth || 0;
		const h = el.offsetHeight || 0;
		const x = Math.round(pt.x - w / 2);
		const y = Math.round(pt.y - h);
		el.style.transform = `translate(${x}px,${y}px)`;
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

		const current = new Set(visibleShops.value.map((s) => s.id));
		// Remove shops no longer visible
		for (const [id] of [...pinInstances]) {
			if (!current.has(id)) unmountPin(id);
		}
		// Add/update visible shops
		for (const shop of visibleShops.value) {
			if (pinInstances.has(shop.id)) {
				positionPin(shop.id, shop); // just reposition
			} else {
				void mountPin(shop); // new pin
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

	watch(showNeonPins, (enabled) => {
		ensureOverlay();
		if (overlayEl) {
			overlayEl.style.opacity = enabled ? "1" : "0";
			overlayEl.style.pointerEvents = enabled ? "auto" : "none";
		}
		syncPins();
	});

	// Re-sync when shops list changes
	watch(
		() => shopsRef.value,
		() => syncPins(),
		{ deep: false },
	);

	onUnmounted(() => {
		mapMoveCleanup?.();
		clearAllPins();
		overlayEl?.remove();
		overlayEl = null;
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
