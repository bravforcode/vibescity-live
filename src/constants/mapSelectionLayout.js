const NARROW_DETAIL_VIEWPORT_MAX_WIDTH = 600;

export const PREVIEW_POPUP_CLEARANCE_PX = 52;
export const PREVIEW_POPUP_CLEARANCE_PX_MOBILE = 4;

// Detail spacing is intentionally tuned here before touching the sign component.
// Keep bottom-sheet clearance and visual lift separate so overlap fixes stay predictable.
export const DETAIL_SELECTION_MODAL_GAP_PX = 76;
export const DETAIL_SELECTION_MODAL_GAP_PX_MOBILE = 72;
export const DETAIL_SELECTION_TARGET_RATIO = 0.24;
export const DETAIL_SELECTION_TARGET_RATIO_MOBILE = 0.28;
export const DETAIL_SELECTION_VISUAL_LIFT_PX = 16;
export const DETAIL_SELECTION_VISUAL_LIFT_PX_MOBILE = 4;

// Selected neon signs render in a transformed DOM overlay, so keep a separate
// visible clearance budget above the detail sheet after transforms are applied.
export const SELECTED_SIGN_MODAL_CLEARANCE_PX = 32;
export const SELECTED_SIGN_MODAL_CLEARANCE_PX_MOBILE = 40;
export const SELECTED_SIGN_TOP_SAFE_PX = 18;
export const SELECTED_SIGN_TOP_SAFE_PX_MOBILE = 40;

export const isNarrowDetailViewport = () =>
	typeof window !== "undefined" &&
	window.innerWidth <= NARROW_DETAIL_VIEWPORT_MAX_WIDTH;

export const getDetailSelectionModalGapPx = () =>
	isNarrowDetailViewport()
		? DETAIL_SELECTION_MODAL_GAP_PX_MOBILE
		: DETAIL_SELECTION_MODAL_GAP_PX;

export const getDetailSelectionTargetRatio = () =>
	isNarrowDetailViewport()
		? DETAIL_SELECTION_TARGET_RATIO_MOBILE
		: DETAIL_SELECTION_TARGET_RATIO;

export const getDetailSelectionVisualLiftPx = () =>
	isNarrowDetailViewport()
		? DETAIL_SELECTION_VISUAL_LIFT_PX_MOBILE
		: DETAIL_SELECTION_VISUAL_LIFT_PX;

export const getPreviewPopupClearancePx = () =>
	isNarrowDetailViewport()
		? PREVIEW_POPUP_CLEARANCE_PX_MOBILE
		: PREVIEW_POPUP_CLEARANCE_PX;

export const getSelectedSignModalClearancePx = () =>
	isNarrowDetailViewport()
		? SELECTED_SIGN_MODAL_CLEARANCE_PX_MOBILE
		: SELECTED_SIGN_MODAL_CLEARANCE_PX;

export const getSelectedSignTopSafePx = () =>
	isNarrowDetailViewport()
		? SELECTED_SIGN_TOP_SAFE_PX_MOBILE
		: SELECTED_SIGN_TOP_SAFE_PX;
