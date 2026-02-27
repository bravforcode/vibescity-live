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
	isDarkMode,
	hasCoins,
	roadDistance,
	roadDuration,
	_tt, // translation function
}) => {
	const media = resolveVenueMedia(item || {});
	const pinState = String(item?.pin_state || "").toLowerCase();
	const isLive =
		pinState === "live" ||
		String(item?.status || "").toUpperCase() === "LIVE" ||
		Boolean(item?.is_live);
	const isEvent = pinState === "event" || Boolean(item?.is_event);
	const bgClass = isDarkMode ? "bg-zinc-900/95" : "bg-white/95";
	const textClass = isDarkMode ? "text-white" : "text-gray-900";

	// Real-time Vibe calculation (Simplified Logic from Ref)
	const currentHour = new Date().getHours();
	// ... (Simplified logic for brevity, ideally passed in or utility used)
	const vibeLevel = item.vibe_level || item.VibeLevel || 3;

	// Visual Vibe Bars
	const vibeBars = Array(5)
		.fill(0)
		.map(
			(_, i) =>
				`<div class="h-4 w-2 rounded-sm ${i < vibeLevel ? "bg-gradient-to-t from-pink-500 to-purple-400" : "bg-white"}"></div>`,
		)
		.join("");

	// Map correctly to i18n if _tt is provided, else fallback
	const fallbackCrowd = crowdMap[vibeLevel] || "Moderate";
	const crowdText =
		_tt && crowdKeyMap[vibeLevel]
			? _tt(crowdKeyMap[vibeLevel], fallbackCrowd)
			: fallbackCrowd;
	const crowdEmoji = crowdEmojiMap[vibeLevel] || "👥";

	const safeName = escapeHtml(item.name || "");
	const safeCategory = escapeHtml(item.category || "Venue");

	// Distance HTML
	let distanceHtml = "";
	if (roadDistance) {
		const distTxt =
			roadDistance < 1000
				? `${Math.round(roadDistance)} m`
				: `${(roadDistance / 1000).toFixed(1)} km`;
		const timeTxt = `${Math.round(roadDuration / 60)} min`;
		distanceHtml = `<div class="road-dist-label absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black text-white text-[11px] font-black border border-white/30 shadow-xl">📍 ${distTxt} (${timeTxt})</div>`;
	} else if (item.distance !== undefined) {
		const fallbackTxt =
			item.distance < 1
				? `${(item.distance * 1000).toFixed(0)} m`
				: `${item.distance.toFixed(1)} km`;
		distanceHtml = `<div class="road-dist-label absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black text-white text-[11px] font-black border border-white/30 shadow-xl">📍 ${fallbackTxt}</div>`;
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
    <div class="vibe-popup ${bgClass} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border-2 border-white/20 overflow-hidden w-[340px] backdrop-blur-3xl" data-shop-id="${safeShopId}">
     <div class="relative w-full aspect-[16/9] max-h-[180px] overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-700 via-pink-600 to-red-600"></div>
        ${
					hasRenderableVideo
						? `<video src="${safeVideoUrl}" poster="${safeImageUrl}" class="absolute inset-0 w-full h-full object-cover" autoplay muted loop playsinline></video>`
						: safeImageUrl
							? `<img src="${safeImageUrl}" alt="${safeName}" class="absolute inset-0 w-full h-full object-cover" />`
							: ""
				}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

        <div class="absolute top-2 left-2 flex flex-col gap-1">
          ${isEvent ? `<div class="px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[9px] font-black">● EVENT</div>` : isLive ? `<div class="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse">● LIVE</div>` : `<div class="px-1.5 py-0.5 rounded-full bg-zinc-500 text-white text-[9px] font-black">● OFF</div>`}
          ${hasCoins ? `<div class="px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[9px] font-black">🪙 +10</div>` : ""}
        </div>

        <button type="button" aria-label="Close popup" class="popup-close-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-sm font-black border-2 border-white/20 z-10">✕</button>

        <!-- Info Overlay -->
        <div class="absolute bottom-3 left-3 right-3">
          <h3 class="text-sm font-black leading-tight mb-0.5 truncate uppercase text-white drop-shadow-lg">${safeName}</h3>
          <div class="text-[10px] font-black text-white/80 uppercase tracking-widest">${safeCategory}</div>
        </div>

        ${distanceHtml}
      </div>

      <div class="p-3 ${textClass}">
        <div class="flex items-center justify-between mb-2 p-1.5 rounded-lg bg-white/10 border border-white/20 backdrop-blur-md">
          <div class="flex items-center gap-1">
            <span class="text-[10px] font-black">VIBE</span>
            <div class="flex items-end gap-px">${vibeBars}</div>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-xs">${crowdEmoji}</span>
            <span class="text-[10px] font-black">${crowdText}</span>
          </div>
        </div>

        ${openHours ? `<div class="text-[10px] font-black mb-1.5">🕐 ${safeOpenHours}</div>` : ""}

        <p class="text-[11px] font-bold leading-relaxed mb-2">${safeShortDesc}</p>

        <div class="flex gap-2" style="pointer-events:auto;position:relative;z-index:10;">
          <button type="button" aria-label="Navigate to ${safeName}" class="popup-nav-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-colors transition-transform">
            <span class="text-xs">🗺️</span>
            <span class="text-[11px] font-bold">Navigate</span>
          </button>
          <button type="button" aria-label="Call ride to ${safeName}" class="popup-ride-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white border border-white/10 active:scale-95 transition-colors transition-transform">
            <span class="text-xs">🚗</span>
            <span class="text-[11px] font-bold">Ride</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

/**
 * Determines the correct pin image based on venue state
 */
const getPinImage = (item) => {
	if (item.is_giant_active) return "/images/pins/pin-purple.png";
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

	// Purple pin marker with glow + label
	el.innerHTML = `
    <div class="giant-pin-wrapper" style="pointer-events:auto; position:relative; transform-origin:bottom center;">
      <div style="position:absolute; top:-8px; right:-8px; z-index:3; pointer-events:none;">
        ${COIN_FLIP_HTML}
      </div>
      <div class="giant-pin-glow-ring"></div>
      <img src="/images/pins/pin-purple.png" alt="" width="48" height="64"
           draggable="false"
           class="giant-pin-purple-img"
           style="width:48px;height:64px;filter:drop-shadow(0 4px 12px rgba(147,51,234,0.5));position:relative;z-index:2;" />
      <div class="giant-pin-label-new">${safeLabel}</div>
    </div>
  `;

	el.style.cursor = "pointer";
	return el;
};
