// src/composables/map/useNeonPinsLayer.js
// Neon pin sign DOM overlay — viewport-clipped, capped at 30 visible venues,
// and clustered into shared neon signs when the camera zooms out.

import { h, onUnmounted, ref, render, watch } from "vue";
import NeonPinSign from "../../components/map/NeonPinSign.vue";

import {
	getSelectedSignModalClearancePx,
	getSelectedSignTopSafePx,
} from "../../constants/mapSelectionLayout";
import { Z } from "../../constants/zIndex";

export const MAX_VISIBLE_NEON_PINS = 30;
export const NEON_PIN_CLUSTER_START_ZOOM = 15.1;
const CLUSTER_CATEGORY_LABEL = "ZOOM IN";
const REGULAR_SIGN_VIEWPORT_PADDING = {
	left: 104,
	right: 104,
	top: 86,
	bottom: 24,
};
const FOCUSED_SIGN_VIEWPORT_PADDING = {
	left: 72,
	right: 72,
	top: 76,
	bottom: 24,
};

const toId = (value) => String(value ?? "").trim();

const toFiniteNumber = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const normalizeShopCoords = (shop) => {
	const lat = toFiniteNumber(shop?.lat ?? shop?.latitude);
	const lng = toFiniteNumber(shop?.lng ?? shop?.longitude);
	if (lat === null || lng === null) return null;
	return { lat, lng };
};

const buildShopRenderSignature = (shop, overlayType) =>
	[
		"shop",
		toId(shop?.id),
		overlayType,
		String(shop?.name ?? ""),
		String(shop?.category ?? shop?.type ?? ""),
		shop?.isLive ? 1 : 0,
	]
		.filter(Boolean)
		.join(":");

const buildRealDisplayItem = (candidate, overlayType = "regular") => ({
	kind: "shop",
	key: `shop:${toId(candidate.shop?.id)}`,
	shop: candidate.shop,
	overlayType,
	renderSignature: buildShopRenderSignature(candidate.shop, overlayType),
	x: candidate.x,
	y: candidate.y,
	offsetX: candidate.offsetX || 0,
	offsetY: candidate.offsetY || 0,
});

const buildClusterKey = (members) =>
	members
		.map((member) => toId(member?.shop?.id))
		.filter(Boolean)
		.sort()
		.join("|");

const buildClusterDisplayItem = (members) => {
	const clusterKey = buildClusterKey(members);
	const memberShops = members.map((member) => member.shop);
	const primaryShop = memberShops[0] ?? {};
	const liveCount = memberShops.filter((shop) => Boolean(shop?.isLive)).length;
	const lat =
		memberShops.reduce((sum, shop) => sum + Number(shop?.lat || 0), 0) /
		Math.max(1, memberShops.length);
	const lng =
		memberShops.reduce((sum, shop) => sum + Number(shop?.lng || 0), 0) /
		Math.max(1, memberShops.length);
	const clusterShop = {
		...primaryShop,
		id: `cluster-${clusterKey}`,
		name: `${memberShops.length} VIBES`,
		category: CLUSTER_CATEGORY_LABEL,
		type: "cluster",
		isCluster: true,
		clusterMembers: memberShops,
		clusterSize: memberShops.length,
		clusterLiveCount: liveCount,
		lat,
		lng,
		isLive: liveCount > 0,
	};

	return {
		kind: "cluster",
		key: `cluster:${clusterKey}`,
		shop: clusterShop,
		overlayType: "regular",
		renderSignature: `cluster:${clusterKey}:${memberShops.length}:${liveCount}`,
		x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
		y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
		offsetX: 0,
		offsetY: 0,
	};
};

export const sortProjectedNeonCandidates = (
	candidates,
	{ focusId = "", centerX = 0, centerY = 0 } = {},
) =>
	[...(candidates || [])].sort((a, b) => {
		const aId = toId(a?.shop?.id);
		const bId = toId(b?.shop?.id);
		const aIsFocused = aId && aId === focusId;
		const bIsFocused = bId && bId === focusId;
		if (aIsFocused !== bIsFocused) return aIsFocused ? -1 : 1;
		if (Boolean(a?.shop?.isLive) !== Boolean(b?.shop?.isLive)) {
			return a?.shop?.isLive ? -1 : 1;
		}
		const aDistance = (a?.x - centerX) ** 2 + (a?.y - centerY) ** 2;
		const bDistance = (b?.x - centerX) ** 2 + (b?.y - centerY) ** 2;
		return aDistance - bDistance;
	});

export const getNeonPinClusterRadiusPx = (zoom) => {
	if (zoom >= NEON_PIN_CLUSTER_START_ZOOM) return 0;
	if (zoom >= 14.6) return 86;
	if (zoom >= 13.8) return 104;
	return 124;
};

/**
 * Spread out pins that are too close to each other in screen space.
 * Uses a deterministic spiral offset based on shop ID.
 * Implements connected-component grouping to ensure NO overlaps at all.
 */
export const applySpiderfying = (candidates, { fixedId = "" } = {}) => {
	if (!candidates || candidates.length < 2) return candidates;

	// Signs are ~150-200px wide and ~50-60px tall.
	const DX_THRESHOLD = 160;
	const DY_THRESHOLD = 48;

	const groups = [];
	const processed = new Set();

	// Helper to find all candidates that overlap with a given candidate
	const findOverlaps = (cand) =>
		candidates.filter((other) => {
			if (other === cand) return false;
			const dx = Math.abs(cand.x - other.x);
			const dy = Math.abs(cand.y - other.y);
			return dx < DX_THRESHOLD && dy < DY_THRESHOLD;
		});

	// Connected components grouping using BFS
	for (const cand of candidates) {
		const id = toId(cand.shop?.id);
		if (processed.has(id)) continue;

		const group = [];
		const queue = [cand];
		processed.add(id);

		while (queue.length > 0) {
			const current = queue.shift();
			group.push(current);

			const overlaps = findOverlaps(current);
			for (const neighbor of overlaps) {
				const neighborId = toId(neighbor.shop?.id);
				if (!processed.has(neighborId)) {
					processed.add(neighborId);
					queue.push(neighbor);
				}
			}
		}
		groups.push(group);
	}

	for (const group of groups) {
		if (group.length <= 1) continue;

		// Sort by ID to keep the spiral pattern stable during map moves
		group.sort((a, b) =>
			String(a.shop?.id).localeCompare(String(b.shop?.id)),
		);

		const count = group.length;
		// More aggressive spacing for larger groups to ensure 0 overlap
		const baseRadius = 80 + count * 10;
		const fixedIndex = group.findIndex((c) => toId(c.shop?.id) === fixedId);

		group.forEach((cand, index) => {
			if (toId(cand.shop?.id) === fixedId) {
				cand.offsetX = 0;
				cand.offsetY = 0;
				return;
			}

			let angle;
			if (fixedIndex !== -1) {
				angle = (index / (count - 1)) * 2 * Math.PI;
			} else {
				angle = (index / count) * 2 * Math.PI;
			}

			// Spiral out for better separation
			const r = count > 3 ? baseRadius + index * 15 : baseRadius;
			cand.offsetX = Math.cos(angle) * r;
			cand.offsetY = Math.sin(angle) * r * 0.75; // Adjust vertical spread
		});
	}

	return candidates;
};

export const isProjectedNeonCandidateVisible = ({
	x,
	y,
	width,
	height,
	isFocused = false,
} = {}) => {
	const padding = isFocused
		? FOCUSED_SIGN_VIEWPORT_PADDING
		: REGULAR_SIGN_VIEWPORT_PADDING;
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		x >= padding.left &&
		x <= width - padding.right &&
		y >= padding.top &&
		y <= height - padding.bottom
	);
};

export const buildNeonPinDisplayItems = ({
	candidates = [],
	zoom = 0,
	focusId = "",
	maxVisible = MAX_VISIBLE_NEON_PINS,
	centerX = 0,
	centerY = 0,
} = {}) => {
	const ordered = sortProjectedNeonCandidates(candidates, {
		focusId,
		centerX,
		centerY,
	}).slice(0, maxVisible);

	const focusedItems = [];
	const regularCandidates = [];
	for (const candidate of ordered) {
		if (toId(candidate?.shop?.id) === focusId) {
			focusedItems.push(buildRealDisplayItem(candidate, "selected"));
			continue;
		}
		regularCandidates.push(candidate);
	}

	const clusterRadius = getNeonPinClusterRadiusPx(zoom);
	if (clusterRadius <= 0) {
		const spiderfied = applySpiderfying(ordered, { fixedId: focusId });
		return spiderfied.map((candidate) => {
			const isFocused = toId(candidate?.shop?.id) === focusId;
			return buildRealDisplayItem(
				candidate,
				isFocused ? "selected" : "regular",
			);
		});
	}

	const groups = [];
	for (const candidate of regularCandidates) {
		let matchedGroup = null;
		for (const group of groups) {
			if (
				Math.hypot(group.x - candidate.x, group.y - candidate.y) <=
				clusterRadius
			) {
				matchedGroup = group;
				break;
			}
		}

		if (!matchedGroup) {
			groups.push({
				x: candidate.x,
				y: candidate.y,
				members: [candidate],
			});
			continue;
		}

		matchedGroup.members.push(candidate);
		const weight = matchedGroup.members.length;
		matchedGroup.x =
			(matchedGroup.x * (weight - 1) + candidate.x) / Math.max(1, weight);
		matchedGroup.y =
			(matchedGroup.y * (weight - 1) + candidate.y) / Math.max(1, weight);
	}

	return [
		...focusedItems,
		...groups.map((group) =>
			group.members.length === 1
				? buildRealDisplayItem(group.members[0], "regular")
				: buildClusterDisplayItem(group.members),
		),
	];
};

export function useNeonPinsLayer(
	mapRef,
	shopsRef,
	containerRef,
	{ onPinClick, highlightedShopId, activePopupShopId, maxVisiblePins = MAX_VISIBLE_NEON_PINS } = {},
) {
	const showNeonPins = ref(true);
	const selectedShopId = ref(null);
	const overlayInstances = new Map();
	let overlayEl = null;
	let selectedOverlayEl = null;
	let overlayObserver = null;
	let modalSurfaceObserver = null;
	let modalSurfaceResizeObserver = null;
	let observedModalSurface = null;
	let mapMoveCleanup = null;
	let detailModalOpen = false;
	let modalSurfaceSyncFrame = 0;
	let focusedPinSettleFrame = 0;
	let focusedPinSettleRemainingFrames = 0;
	let modalSurfaceSettleTimeouts = [];
	let lastModalSurfaceSignature = "";
	let modalSurfaceStableFrames = 0;
	let modalSurfaceMissingFrames = 0;
	const MODAL_SURFACE_STABLE_FRAME_TARGET = 3;
	const MODAL_SURFACE_WAIT_FRAME_LIMIT = 90;
	const FOCUSED_PIN_SETTLE_FRAME_BUDGET = 28;

	const resolveHighlightedId = () =>
		toId(
			typeof highlightedShopId === "function"
				? highlightedShopId()
				: highlightedShopId?.value,
		);
	const resolvePreviewPopupId = () =>
		toId(
			typeof activePopupShopId === "function"
				? activePopupShopId()
				: activePopupShopId?.value,
		);
	const resolveFocusedId = () =>
		resolvePreviewPopupId() || resolveHighlightedId();
	const resolveFocusedKey = () => {
		const focusedId = resolveFocusedId();
		return focusedId ? `shop:${focusedId}` : "";
	};
	const hasDetailModalOpen = () => Boolean(resolveDetailModalSurface());
	const getShopsSignature = () =>
		Array.isArray(shopsRef.value)
			? shopsRef.value
					.map((shop) => {
						const coords = normalizeShopCoords(shop) || {};
						return [
							toId(shop?.id),
							coords.lat ?? "",
							coords.lng ?? "",
							String(shop?.name ?? ""),
							String(shop?.category ?? shop?.type ?? ""),
							shop?.isLive ? 1 : 0,
						].join(":");
					})
					.join("|")
			: "";

	const syncSelectedOverlayLayer = () => {
		if (!selectedOverlayEl) return;
		const isModalOpen = hasDetailModalOpen();
		// Z.SUBMODAL is 13000, which is for ride apps etc.
		// Let's put the selected sign above the modal (12000) and close button (12010)
		// but below actual submodals to ensure it stays in front of the modal's backdrop.
		selectedOverlayEl.style.zIndex = String(
			isModalOpen ? Z.MODAL_TOP + 100 : Z.MAPBOX_POPUP + 5,
		);
		// BRIGHTNESS FIX: Use CSS variables for standardized brightness and accessibility.
		// Selected overlay gets a subtle boost while remaining within standard levels (1.0 +/- 10%)
		// following WCAG 2.1 contrast guidelines.
		selectedOverlayEl.style.filter = isModalOpen
			? "brightness(var(--vc-ui-selected-brightness, 1.1)) contrast(var(--vc-ui-contrast, 1.0))"
			: "brightness(var(--vc-ui-brightness, 1.0))";
	};

	const stopModalSurfaceSyncLoop = () => {
		if (!modalSurfaceSyncFrame) return;
		cancelAnimationFrame(modalSurfaceSyncFrame);
		modalSurfaceSyncFrame = 0;
		modalSurfaceStableFrames = 0;
		modalSurfaceMissingFrames = 0;
	};

	const stopFocusedPinSettleLoop = () => {
		if (!focusedPinSettleFrame) return;
		cancelAnimationFrame(focusedPinSettleFrame);
		focusedPinSettleFrame = 0;
		focusedPinSettleRemainingFrames = 0;
	};

	const clearModalSurfaceSettleTimeouts = () => {
		for (const timeoutId of modalSurfaceSettleTimeouts) {
			clearTimeout(timeoutId);
		}
		modalSurfaceSettleTimeouts = [];
	};

	const disconnectModalSurfaceResizeObserver = () => {
		modalSurfaceResizeObserver?.disconnect?.();
		modalSurfaceResizeObserver = null;
	};

	const disconnectModalSurfaceObserver = () => {
		modalSurfaceObserver?.disconnect?.();
		modalSurfaceObserver = null;
		disconnectModalSurfaceResizeObserver();
		clearModalSurfaceSettleTimeouts();
		observedModalSurface = null;
	};

	const resolveDetailModalSurface = () =>
		typeof document !== "undefined"
			? document.querySelector("[data-testid='vibe-modal-surface']")
			: null;

	const getModalSurfaceSignature = (
		modalSurface = resolveDetailModalSurface(),
	) => {
		if (!modalSurface) return "";
		const rect = modalSurface.getBoundingClientRect();
		return `${Math.round(rect.top)}:${Math.round(rect.height)}:${Math.round(rect.width)}`;
	};

	const project = (shop) => {
		const coords = normalizeShopCoords(shop);
		if (!coords) return null;
		try {
			return mapRef.value?.project([coords.lng, coords.lat]);
		} catch {
			return null;
		}
	};

	const buildFocusedDisplayItem = () => {
		const focusedId = resolveFocusedId();
		if (!focusedId) return null;
		const focusedShop = shopsRef.value?.find(
			(shop) => toId(shop?.id) === focusedId,
		);
		if (!focusedShop) return null;
		const coords = normalizeShopCoords(focusedShop);
		if (!coords) return null;
		return buildRealDisplayItem(
			{
				shop: { ...focusedShop, ...coords },
			},
			"selected",
		);
	};

	const getVisibleDisplayItems = () => {
		if (
			!showNeonPins.value ||
			!Array.isArray(shopsRef.value) ||
			!mapRef.value
		) {
			return [];
		}

		const map = mapRef.value;
		const canvas = map.getCanvas?.();
		const width = canvas?.clientWidth || canvas?.width || 375;
		const height = canvas?.clientHeight || canvas?.height || 667;
		const centerX = width / 2;
		const centerY = height / 2;
		const zoom = Number(map.getZoom?.() ?? 0);
		const focusId = resolveFocusedId();
		const candidates = [];

		for (const shop of shopsRef.value) {
			const coords = normalizeShopCoords(shop);
			if (!coords) continue;
			try {
				const pt = map.project([coords.lng, coords.lat]);
				if (
					!isProjectedNeonCandidateVisible({
						x: pt.x,
						y: pt.y,
						width,
						height,
						isFocused: toId(shop?.id) === focusId,
					})
				) {
					continue;
				}
				candidates.push({
					shop: { ...shop, ...coords },
					x: pt.x,
					y: pt.y,
				});
			} catch (e) {
				console.warn("Map projection error in useNeonPinsLayer:", e);
				// ignore broken projections while the map is reconfiguring
			}
		}

		return buildNeonPinDisplayItems({
			candidates,
			zoom,
			focusId,
			maxVisible: maxVisiblePins, // Use dynamic value
			centerX,
			centerY,
		});
	};

	const observeModalSurface = () => {
		if (typeof MutationObserver !== "function") return;
		const modalSurface = resolveDetailModalSurface();
		if (modalSurface === observedModalSurface) return;
		disconnectModalSurfaceObserver();
		if (!modalSurface) return;
		observedModalSurface = modalSurface;
		modalSurfaceObserver = new MutationObserver(() => {
			modalSurfaceStableFrames = 0;
			queueModalSurfaceSettlePasses();
			syncDetailModalState();
		});
		modalSurfaceObserver.observe(modalSurface, {
			attributes: true,
			attributeFilter: ["style", "class"],
		});
		if (typeof ResizeObserver === "function") {
			modalSurfaceResizeObserver = new ResizeObserver(() => {
				modalSurfaceStableFrames = 0;
				lastModalSurfaceSignature = "";
				queueModalSurfaceSettlePasses();
				if (!syncFocusedPinOnly()) {
					syncPins();
				}
				syncDetailModalState();
			});
			modalSurfaceResizeObserver.observe(modalSurface);
		}
		queueModalSurfaceSettlePasses();
	};

	const syncDetailModalState = () => {
		const nextDetailModalOpen = hasDetailModalOpen();
		if (nextDetailModalOpen !== detailModalOpen) {
			detailModalOpen = nextDetailModalOpen;
			lastModalSurfaceSignature = "";
			modalSurfaceStableFrames = 0;
			modalSurfaceMissingFrames = 0;
			if (!syncFocusedPinOnly()) {
				syncPins();
			}
			scheduleFocusedPinSettle();
			queueModalSurfaceSettlePasses();
		}
		syncSelectedOverlayLayer();
		if (!detailModalOpen) {
			disconnectModalSurfaceObserver();
			stopModalSurfaceSyncLoop();
			return;
		}
		observeModalSurface();
		if (modalSurfaceSyncFrame) return;
		const run = () => {
			modalSurfaceSyncFrame = 0;
			if (!hasDetailModalOpen()) {
				detailModalOpen = false;
				lastModalSurfaceSignature = "";
				modalSurfaceMissingFrames = 0;
				syncSelectedOverlayLayer();
				disconnectModalSurfaceObserver();
				stopFocusedPinSettleLoop();
				return;
			}
			const modalSurface = resolveDetailModalSurface();
			if (!modalSurface) {
				lastModalSurfaceSignature = "";
				modalSurfaceStableFrames = 0;
				modalSurfaceMissingFrames += 1;
				if (modalSurfaceMissingFrames < MODAL_SURFACE_WAIT_FRAME_LIMIT) {
					modalSurfaceSyncFrame = requestAnimationFrame(run);
				}
				return;
			}
			modalSurfaceMissingFrames = 0;
			observeModalSurface();
			const nextSignature = getModalSurfaceSignature(modalSurface);
			if (nextSignature && nextSignature !== lastModalSurfaceSignature) {
				lastModalSurfaceSignature = nextSignature;
				modalSurfaceStableFrames = 0;
				if (!syncFocusedPinOnly()) {
					syncPins();
				}
				scheduleFocusedPinSettle();
			} else {
				modalSurfaceStableFrames += 1;
			}
			if (modalSurfaceStableFrames < MODAL_SURFACE_STABLE_FRAME_TARGET) {
				modalSurfaceSyncFrame = requestAnimationFrame(run);
			}
		};
		modalSurfaceSyncFrame = requestAnimationFrame(run);
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
		syncDetailModalState();
		
		// PERFORMANCE FIX: Do NOT observe document.body with subtree: true.
		// This causes massive performance degradation as it fires on every single DOM change.
		// Instead, we rely on the specific modal surface observer or app-level state changes.
		if (typeof MutationObserver === "function" && !overlayObserver) {
			overlayObserver = new MutationObserver((mutations) => {
				// Only trigger if the modal surface itself might have been added/removed
				const hasModalChange = mutations.some(m => 
					Array.from(m.addedNodes).some(n => n.dataset?.testid === 'vibe-modal-surface') ||
					Array.from(m.removedNodes).some(n => n.dataset?.testid === 'vibe-modal-surface')
				);
				if (hasModalChange) {
					syncDetailModalState();
				}
			});
			overlayObserver.observe(document.body, {
				childList: true,
				subtree: false, // Changed to false for performance
			});
		}
	};

	const positionItem = (key, item = overlayInstances.get(key)?.item) => {
		const entry = overlayInstances.get(key);
		if (!entry || !item?.shop) return;
		const pt = project(item.shop);
		if (!pt) return;

		const isSelectedOverlay = entry.overlayType === "selected";
		const containerRect = containerRef.value?.getBoundingClientRect?.();
		const el = entry.el;
		const w = el.offsetWidth || 0;
		const h = el.offsetHeight || 0;
		const x =
			(isSelectedOverlay ? (containerRect?.left ?? 0) : 0) +
			pt.x -
			w / 2 +
			(item.offsetX || 0);
		const y =
			(isSelectedOverlay ? (containerRect?.top ?? 0) : 0) +
			pt.y -
			h +
			(item.offsetY || 0);

		el.style.zIndex =
			key === resolveFocusedKey() ? "30" : item.kind === "cluster" ? "2" : "1";

		// --- Bounds check for selected overlay to prevent bleeding over BottomFeed ---
		// When the BottomFeed panel slides up over the map, the map canvas rect shrinks
		// (or the pin's map-space coordinate falls below the visible area).
		// Hide the sign instead of letting it render as position:fixed over the cards.
		if (isSelectedOverlay) {
			const canvas = mapRef.value?.getCanvas?.();
			const mapW = canvas?.clientWidth || canvas?.width || 0;
			const mapH = canvas?.clientHeight || canvas?.height || 0;
			// Allow a small overhang so the sign is still visible when pin is near edge
			const TOLERANCE_PX = 24;
			const isOutsideCanvas =
				mapW > 0 &&
				mapH > 0 &&
				(pt.x < -TOLERANCE_PX ||
					pt.x > mapW + TOLERANCE_PX ||
					pt.y < -TOLERANCE_PX ||
					pt.y > mapH + TOLERANCE_PX);

			// Check if detail modal is closed - if so, we should only show it if it's within map bounds
			const isDetailModalClosed = !hasDetailModalOpen();

			if (isOutsideCanvas || isDetailModalClosed) {
				// If modal is closed and pin is outside map viewport, hide it.
				// This prevents "ghost" neon signs from sticking to the screen
				// when the user scrolls the carousel and the previous pin moves off-screen.
				if (isOutsideCanvas) {
					el.style.opacity = "0";
					el.style.pointerEvents = "none";
					return;
				}
			}
			// Restore visibility when pin comes back into view
			el.style.opacity = "";
			el.style.pointerEvents = "auto";
		}

		if (isSelectedOverlay && hasDetailModalOpen()) {
			const modalSurface = resolveDetailModalSurface();
			if (modalSurface) {
				const modalTop = modalSurface.getBoundingClientRect().top;
				const clearancePx = getSelectedSignModalClearancePx();
				const topSafePx = getSelectedSignTopSafePx();
				const maxY = modalTop - clearancePx - h;
				const centerY = Math.round(topSafePx + (maxY - topSafePx) / 2);
				const finalY = Math.max(topSafePx, Math.min(maxY, centerY));
				el.style.transform = `translate3d(${x}px, ${finalY}px, 0)`;
				return;
			}
		}

		el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
	};

	const unmountItem = (key) => {
		const entry = overlayInstances.get(key);
		if (!entry) return;
		entry.unmount();
		entry.el.remove();
		overlayInstances.delete(key);
	};

	const mountItem = (item) => {
		if (!overlayEl && !selectedOverlayEl) return;
		unmountItem(item.key);

		const targetOverlay =
			item.overlayType === "selected" ? selectedOverlayEl : overlayEl;
		if (!targetOverlay) return;

		const el = document.createElement("div");
		el.style.cssText =
			"position:absolute;left:0;top:0;pointer-events:auto;will-change:transform;";
		el.dataset.overlayType = item.overlayType;
		targetOverlay.appendChild(el);

		const vnode = h(NeonPinSign, {
			shop: item.shop,
			isVisible: true,
			isSelected: item.overlayType === "selected",
			onClick: (shop) => handlePinClick(shop),
		});
		render(vnode, el);
		overlayInstances.set(item.key, {
			el,
			unmount: () => render(null, el),
			overlayType: item.overlayType,
			item,
			renderSignature: item.renderSignature,
		});
		positionItem(item.key, item);
		if (item.overlayType === "selected") {
			scheduleFocusedPinSettle();
		}
	};

	const clearAllPins = () => {
		for (const key of [...overlayInstances.keys()]) {
			unmountItem(key);
		}
	};

	const clearSelectedOverlayItems = (focusedKey = "") => {
		for (const [key, entry] of [...overlayInstances.entries()]) {
			if (entry.overlayType !== "selected") continue;
			if (focusedKey && key === focusedKey) continue;
			unmountItem(key);
		}
	};

	const syncFocusedPinOnly = () => {
		const focusedItem = buildFocusedDisplayItem();
		if (!focusedItem) {
			clearSelectedOverlayItems();
			return false;
		}
		const focusedKey = focusedItem.key;
		clearSelectedOverlayItems(focusedKey);
		const entry = overlayInstances.get(focusedKey);
		if (
			!entry ||
			entry.overlayType !== "selected" ||
			entry.renderSignature !== focusedItem.renderSignature
		) {
			mountItem(focusedItem);
			return true;
		}
		entry.item = focusedItem;
		positionItem(focusedKey, focusedItem);
		return true;
	};

	const scheduleFocusedPinSettle = () => {
		const focusedKey = resolveFocusedKey();
		if (!focusedKey) {
			stopFocusedPinSettleLoop();
			return;
		}
		focusedPinSettleRemainingFrames = Math.max(
			focusedPinSettleRemainingFrames,
			FOCUSED_PIN_SETTLE_FRAME_BUDGET,
		);
		if (focusedPinSettleFrame) return;
		const run = () => {
			focusedPinSettleFrame = 0;
			const nextFocusedKey = resolveFocusedKey();
			if (!nextFocusedKey || focusedPinSettleRemainingFrames <= 0) {
				focusedPinSettleRemainingFrames = 0;
				return;
			}
			positionItem(nextFocusedKey);
			focusedPinSettleRemainingFrames -= 1;
			if (focusedPinSettleRemainingFrames > 0) {
				focusedPinSettleFrame = requestAnimationFrame(run);
			}
		};
		focusedPinSettleFrame = requestAnimationFrame(run);
	};

	const queueModalSurfaceSettlePasses = () => {
		if (!resolveDetailModalSurface()) return;
		clearModalSurfaceSettleTimeouts();
		const delays = [0, 90, 220, 380];
		modalSurfaceSettleTimeouts = delays.map((delay) =>
			setTimeout(() => {
				if (!hasDetailModalOpen()) return;
				if (!syncFocusedPinOnly()) {
					syncPins();
				}
				scheduleFocusedPinSettle();
			}, delay),
		);
	};

	const zoomIntoCluster = (clusterShop) => {
		const map = mapRef.value;
		if (!map) return;
		const coords = normalizeShopCoords(clusterShop);
		if (!coords) return;
		const currentZoom = Number(map.getZoom?.() ?? 0);
		const clusterSize = Number(
			clusterShop?.clusterSize || clusterShop?.clusterMembers?.length || 2,
		);
		const zoomStep = clusterSize >= 8 ? 2.2 : clusterSize >= 5 ? 1.9 : 1.6;
		map.easeTo({
			center: [coords.lng, coords.lat],
			zoom: Math.min(
				18,
				Math.max(currentZoom + zoomStep, NEON_PIN_CLUSTER_START_ZOOM + 0.35),
			),
			duration: 460,
			essential: true,
		});
	};

	const handlePinClick = (shop) => {
		if (shop?.isCluster) {
			zoomIntoCluster(shop);
			return;
		}
		selectedShopId.value = shop?.id ?? null;
		onPinClick?.(shop);
		scheduleFocusedPinSettle();
	};

	let syncPinsFrame = 0;
	const syncPins = () => {
		if (syncPinsFrame) return;
		syncPinsFrame = requestAnimationFrame(() => {
			syncPinsFrame = 0;
			if (!showNeonPins.value) {
				clearAllPins();
				return;
			}
			ensureOverlay();

			const visibleItems = getVisibleDisplayItems();
			const currentKeys = new Set(visibleItems.map((item) => item.key));
			for (const key of [...overlayInstances.keys()]) {
				if (!currentKeys.has(key)) {
					unmountItem(key);
				}
			}

			for (const item of visibleItems) {
				const entry = overlayInstances.get(item.key);
				if (
					!entry ||
					entry.overlayType !== item.overlayType ||
					entry.renderSignature !== item.renderSignature
				) {
					mountItem(item);
					continue;
				}
				entry.item = item;
				positionItem(item.key, item);
			}
		});
	};

	const repositionAll = () => {
		syncPins();
	};

	const attachMapListener = (map) => {
		if (mapMoveCleanup) return;
		map.on("move", repositionAll);
		map.on("zoom", repositionAll);
		map.on("moveend", repositionAll);
		map.on("zoomend", repositionAll);
		mapMoveCleanup = () => {
			map.off("move", repositionAll);
			map.off("zoom", repositionAll);
			map.off("moveend", repositionAll);
			map.off("zoomend", repositionAll);
		};
	};

	watch(
		() => mapRef.value,
		(map) => {
			if (!map) return;
			attachMapListener(map);
			syncPins();
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
			scheduleFocusedPinSettle();
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

	watch(getShopsSignature, () => syncPins(), { immediate: true });

	onUnmounted(() => {
		mapMoveCleanup?.();
		stopModalSurfaceSyncLoop();
		stopFocusedPinSettleLoop();
		clearModalSurfaceSettleTimeouts();
		clearAllPins();
		overlayObserver?.disconnect?.();
		overlayObserver = null;
		disconnectModalSurfaceObserver();
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
		syncPins,
	};
}
