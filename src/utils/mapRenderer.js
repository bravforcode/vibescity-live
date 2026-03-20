import { resolveVenueMedia } from "../domain/venue/viewModel";

/**
 * Mappings for Vibe Status and Emojis
 */
const crowdMap = {
	5: "Packed",
	4: "Busy",
	3: "Moderate",
	2: "Quiet",
	1: "Empty",
};

const crowdEmojiMap = {
	5: "🔥",
	4: "🔥",
	3: "👥",
	2: "😌",
	1: "😌",
};

const crowdKeyMap = {
	5: "common.crowd.very_high",
	4: "common.crowd.high",
	3: "common.crowd.medium",
	2: "common.crowd.low",
	1: "common.crowd.quiet",
};

export const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/`/g, "&#96;");

const sanitizeUrl = (url) => {
	if (!url) return "";
	try {
		const base = globalThis.location?.origin || "https://vibecity.live";
		const parsed = new URL(url, base);
		if (parsed.protocol === "data:") {
			return String(url).startsWith("data:image/") ? String(url) : "";
		}
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.toString();
		}
		return "";
	} catch {
		return "";
	}
};

const sanitizeId = (value) =>
	String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m3u8)(?:\?.*)?$/i;

const COIN_FLIP_HTML = `<div class="vibe-coin-flip"><div class="vibe-coin-flip-inner">🪙</div></div>`;

/**
 * Creates the HTML string for the Mapbox Popup
 */
export const createPopupHTML = ({
	item,
	isDarkMode: _isDarkMode,
	hasCoins,
	roadDistance,
	roadDuration,
	tt, // translation function
}) => {
	const media = resolveVenueMedia(item || {});
	const pinState = String(item?.pin_state || "").toLowerCase();
	const isLive =
		pinState === "live" ||
		String(item?.status || "").toUpperCase() === "LIVE" ||
		Boolean(item?.is_live);
	const isEvent = pinState === "event" || Boolean(item?.is_event);
	const vibeLevel = item.vibe_level || item.VibeLevel || 3;

	// Visual Vibe Bars
	const vibeBars = Array(5)
		.fill(0)
		.map(
			(_, i) =>
				`<span class="vibe-popup__vibe-bar ${i < vibeLevel ? "vibe-popup__vibe-bar--active" : "vibe-popup__vibe-bar--inactive"}"></span>`,
		)
		.join("");

	// Map correctly to i18n if _tt is provided, else fallback
	const fallbackCrowd = crowdMap[vibeLevel] || "Moderate";
	const crowdText =
		tt && crowdKeyMap[vibeLevel]
			? tt(crowdKeyMap[vibeLevel], fallbackCrowd)
			: fallbackCrowd;
	const crowdEmoji = crowdEmojiMap[vibeLevel] || "👥";

	const safeName = escapeHtml(item.name || "");
	const safeCategory = escapeHtml(item.category || "Venue");

	// Distance HTML
	let distanceHtml = "";
	if (roadDistance != null && roadDuration != null) {
		const distTxt =
			roadDistance < 1000
				? `${Math.round(roadDistance)} m`
				: `${(roadDistance / 1000).toFixed(1)} km`;
		const timeTxt = `${Math.round(roadDuration / 60)} min`;
		distanceHtml = `<div class="road-dist-label vibe-popup__distance">📍 ${distTxt} (${timeTxt})</div>`;
	} else if (item.distance !== undefined) {
		const fallbackTxt =
			item.distance < 1
				? `${(item.distance * 1000).toFixed(0)} m`
				: `${item.distance.toFixed(1)} km`;
		distanceHtml = `<div class="road-dist-label vibe-popup__distance">📍 ${fallbackTxt}</div>`;
	}

	// Descriptions (Optional: Pass defaultDescs or handle here)
	const description =
		item.description ||
		item.Description ||
		item.vibe_status ||
		"✨ A popular spot you must experience for yourself";
	const shortDesc =
		description.length > 85 ? `${description.substring(0, 85)}…` : description;
	const safeShortDesc = escapeHtml(shortDesc);

	const openHours = item.open_hours || item.Open || "";
	const safeOpenHours = escapeHtml(openHours);
	const safeVideoUrl = sanitizeUrl(
		media.videoUrl || item.videoUrl || item.video_url || item.Video_URL,
	);
	const safeImageUrl = sanitizeUrl(
		media.primaryImage || item.Image_URL1 || item.cover_image,
	);
	const hasRenderableVideo =
		Boolean(safeVideoUrl) &&
		(VIDEO_EXT_RE.test(safeVideoUrl) ||
			/youtube\.com|youtu\.be|vimeo\.com|stream|video/i.test(safeVideoUrl));
	const safeShopId = sanitizeId(item.id);

	return `
    <div class="vibe-popup" data-shop-id="${safeShopId}">
      <div class="vibe-popup__hero">
        <div class="vibe-popup__hero-fallback"></div>
        ${
					hasRenderableVideo
						? `<video src="${safeVideoUrl}" poster="${safeImageUrl}" class="vibe-popup__media" autoplay muted loop playsinline crossorigin="anonymous"></video>`
						: safeImageUrl
							? `<img src="${safeImageUrl}" alt="${safeName}" class="vibe-popup__media" crossorigin="anonymous" />`
							: ""
				}
        <div class="vibe-popup__hero-scrim"></div>

        <div class="vibe-popup__badges">
          ${isEvent ? `<div class="vibe-popup__badge vibe-popup__badge--event">● EVENT</div>` : isLive ? `<div class="vibe-popup__badge vibe-popup__badge--live">● LIVE</div>` : `<div class="vibe-popup__badge vibe-popup__badge--off">● OFF</div>`}
          ${hasCoins ? `<div class="vibe-popup__badge vibe-popup__badge--coins">🪙 +10</div>` : ""}
        </div>

        <button type="button" aria-label="Close popup" class="popup-close-btn vibe-popup__close">✕</button>

        <!-- Info Overlay -->
        <div class="vibe-popup__hero-meta">
          <h3 class="vibe-popup__title">${safeName}</h3>
          <div class="vibe-popup__category">${safeCategory}</div>
        </div>

        ${distanceHtml}
      </div>

      <div class="vibe-popup__body">
        <div class="vibe-popup__vibe-panel">
          <div class="vibe-popup__vibe-group">
            <span class="vibe-popup__vibe-label">VIBE</span>
            <div class="vibe-popup__vibe-bars">${vibeBars}</div>
          </div>
          <div class="vibe-popup__crowd">
            <span class="vibe-popup__crowd-emoji">${crowdEmoji}</span>
            <span class="vibe-popup__crowd-text">${escapeHtml(crowdText)}</span>
          </div>
        </div>

        ${openHours ? `<div class="vibe-popup__hours">🕐 ${safeOpenHours}</div>` : ""}

        <p class="vibe-popup__description">${safeShortDesc}</p>

        <button type="button" aria-label="Navigate to ${safeName}" class="popup-nav-btn vibe-popup__nav-btn">
          <span class="vibe-popup__nav-icon">🗺️</span>
          <span class="vibe-popup__nav-text">Navigate</span>
        </button>
      </div>
    </div>
  `;
};

/**
 * Determines the correct pin image based on venue state
 */
const getPinImage = (item) => {
	if (item.is_giant_active) return "/images/pins/pin-blue.png";
	if (item.status === "LIVE" || item.is_open !== false)
		return "/images/pins/pin-red.png";
	return "/images/pins/pin-gray.png";
};

export const createMarkerElement = ({
	item,
	isHighlighted,
	isLive,
	hasCoins = false,
}) => {
	const el = document.createElement("div");
	el.className = `vibe-marker-root vibe-pin-bounce ${isHighlighted ? "z-50 vibe-pin-highlighted" : "z-10"}`;
	el.dataset.shopId = sanitizeId(item.id);
	el.style.pointerEvents = "none"; // Fixes transparent hitbox blocking other markers

	const isGiant = item.is_giant_active;
	const pinSrc = getPinImage(item);
	const pinW = isHighlighted ? 64 : isGiant ? 54 : 44;
	const pinH = isHighlighted ? 84 : isGiant ? 74 : 64;

	el.innerHTML = `
    <div class="vibe-marker-container" style="display:flex;flex-direction:column;align-items:center;position:relative;">
      <div class="vibe-marker-hitbox relative group" style="width:${pinW}px;height:${pinH}px;pointer-events:auto;">
         ${isLive ? `<div class="vibe-live-glow"></div>` : ""}
         ${isGiant ? `<div class="vibe-giant-glow"></div>` : ""}

         <img src="${pinSrc}" alt="" width="${pinW}" height="${pinH}"
              class="vibe-pin-img" draggable="false"
              style="width:${pinW}px;height:${pinH}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));" />

         ${isLive ? `<div class="vibe-live-badge">LIVE</div>` : ""}
         ${isGiant ? `<div class="vibe-giant-badge">★</div>` : ""}

         ${
						hasCoins
							? `<div class="marker-float" style="position:absolute;top:-10px;right:-10px;z-index:20;pointer-events:none;">
                ${COIN_FLIP_HTML}
              </div>`
							: ""
					}
       </div>
     </div>
   `;

	return el;
};

/**
 * Creates the DOM element for a giant pin marker (Events)
 */
export const createGiantPinElement = (event) => {
	const el = document.createElement("div");
	el.className = "giant-pin-marker";
	el.dataset.eventId = sanitizeId(event.id);
	const safeLabel = escapeHtml(event.shortName || event.name || "Event");

	// cyan pin marker with glow + label
	el.innerHTML = `
    <div class="giant-pin-wrapper" style="pointer-events:auto; position:relative; transform-origin:bottom center;">
      <div style="position:absolute; top:-8px; right:-8px; z-index:3; pointer-events:none;">
        ${COIN_FLIP_HTML}
      </div>
      <div class="giant-pin-glow-ring"></div>
      <img src="/images/pins/pin-blue.png" alt="" width="48" height="64"
           draggable="false"
           class="giant-pin-blue-img"
           style="width:48px;height:64px;filter:drop-shadow(0 4px 12px rgba(147,51,234,0.5));position:relative;z-index:2;" />
      <div class="giant-pin-label-new">${safeLabel}</div>
    </div>
  `;

	el.style.cursor = "pointer";
	return el;
};
