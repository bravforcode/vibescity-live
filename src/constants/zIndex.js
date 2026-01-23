// src/constants/zIndex.js
export const Z = Object.freeze({
  // Base map & content
  MAP: 500,

  // Mapbox popup should be above the map but below app overlays
  MAPBOX_POPUP: 10000,

  // Drawers (Mall/Profile)
  DRAWER: 11000,
  DRAWER_BACKDROP: 10999,

  // Main modal (shop detail)
  MODAL: 12000,
  MODAL_TOP: 12010, // close button, etc.

  // Sub-modals / popups inside modal (ride popup, zoom image)
  SUBMODAL: 13000,
});
