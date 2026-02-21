/**
 * Mappings for Vibe Status and Emojis
 */
const crowdMap = {
	5: "คึกคัก",
	4: "มาก",
	3: "ปานกลาง",
	2: "น้อย",
	1: "เงียบ",
};

const crowdEmojiMap = {
	5: "🔥",
	4: "🔥",
	3: "👥",
	2: "😌",
	1: "😌",
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
	const isLive = item.status === "LIVE";
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

	const crowdText = crowdMap[vibeLevel] || "ปานกลาง";
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
		"✨ สถานที่ยอดนิยมที่คุณต้องมาสัมผัสด้วยตัวเอง";
	const shortDesc =
		description.length > 85
			? `${description.substring(0, 85)}...`
			: description;
	const safeShortDesc = escapeHtml(shortDesc);

	const openHours = item.open_hours || item.Open || "";
	const safeOpenHours = escapeHtml(openHours);
	const safeImageUrl = sanitizeUrl(item.Image_URL1);
	const safeShopId = sanitizeId(item.id);

	return `
    <div class="vibe-popup ${bgClass} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border-2 border-white/20 overflow-hidden w-[280px] backdrop-blur-3xl" data-shop-id="${safeShopId}">
     <div class="relative w-full aspect-[9/16] max-h-[360px] overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-700 via-pink-600 to-red-600"></div>
        ${
					safeImageUrl
						? `<img src="${safeImageUrl}" alt="${safeName}" class="absolute inset-0 w-full h-full object-cover" />`
						: ""
				}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

        <div class="absolute top-2 left-2 flex flex-col gap-1">
          ${isLive ? `<div class="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse">● LIVE</div>` : ""}
          ${hasCoins ? `<div class="px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[9px] font-black">🪙 +10</div>` : ""}
        </div>

        <button type="button" aria-label="ปิด popup" class="popup-close-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-sm font-black border-2 border-white/20 z-10">✕</button>

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

        <div class="flex gap-2">
          <button class="popup-nav-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-all">
            <span class="text-xs">🗺️</span>
            <span class="text-[11px] font-bold">นำทาง</span>
          </button>
          <button class="popup-ride-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white border border-white/10 active:scale-95 transition-all">
            <span class="text-xs">🚗</span>
            <span class="text-[11px] font-bold">เรียกรถ</span>
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
	hasCoins = true,
}) => {
	const el = document.createElement("div");
	el.className = `vibe-marker-root vibe-pin-bounce ${isHighlighted ? "z-50 vibe-pin-highlighted" : "z-10"}`;
	el.dataset.shopId = sanitizeId(item.id);

	const isGiant = item.is_giant_active;
	const pinSrc = getPinImage(item);
	const pinW = isHighlighted ? 40 : isGiant ? 38 : 30;
	const pinH = isHighlighted ? 50 : isGiant ? 47 : 37;

	el.innerHTML = `
    <div class="vibe-marker-container" style="display:flex;flex-direction:column;align-items:center;">
      ${
				hasCoins
					? `<div class="marker-float" style="margin-bottom:-14px;z-index:20;pointer-events:none;">
        <div class="lottie-coin-target" style="width:24px;height:24px;"></div>
      </div>`
					: ""
			}

      <div class="vibe-marker-hitbox relative group" style="width:${pinW}px;height:${pinH}px;">
         ${isLive ? `<div class="vibe-live-glow"></div>` : ""}
         ${isGiant ? `<div class="vibe-giant-glow"></div>` : ""}

         <img src="${pinSrc}" alt="" width="${pinW}" height="${pinH}"
              class="vibe-pin-img" draggable="false"
              style="width:${pinW}px;height:${pinH}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));" />

         ${isLive ? `<div class="vibe-live-badge">LIVE</div>` : ""}
         ${isGiant ? `<div class="vibe-giant-badge">★</div>` : ""}
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
	const safeEventId = sanitizeId(event.id);
	const safeLabel = escapeHtml(event.shortName || event.name || "Event");
	const safeIconUrl = sanitizeUrl(event.icon);

	// Premium SVG-based event marker
	el.innerHTML = `
    <div class="giant-pin-wrapper">
      <svg class="giant-pin-svg" width="80" height="100" viewBox="0 0 80 100" fill="none">
        <defs>
          <!-- Premium gradient -->
          <linearGradient id="eventGrad-${safeEventId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8B5CF6"/>
            <stop offset="50%" stop-color="#EC4899"/>
            <stop offset="100%" stop-color="#F43F5E"/>
          </linearGradient>
          <!-- Glow filter -->
          <filter id="eventGlow-${safeEventId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <!-- Inner shadow -->
          <filter id="eventInner-${safeEventId}">
            <feOffset dx="0" dy="2"/>
            <feGaussianBlur stdDeviation="2"/>
            <feComposite operator="out" in="SourceGraphic"/>
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.3 0"/>
            <feBlend in="SourceGraphic"/>
          </filter>
        </defs>

        <!-- Outer glow ring (animated) -->
        <circle cx="40" cy="35" r="30" fill="none" stroke="url(#eventGrad-${safeEventId})" stroke-width="2" opacity="0.5" class="pulse-ring"/>

        <!-- Main body -->
        <circle cx="40" cy="35" r="28" fill="url(#eventGrad-${safeEventId})" filter="url(#eventGlow-${safeEventId})"/>

        <!-- Highlight -->
        <ellipse cx="40" cy="28" rx="16" ry="10" fill="white" opacity="0.2"/>

        <!-- Icon circle -->
        <circle cx="40" cy="35" r="18" fill="rgba(255,255,255,0.15)"/>

        <!-- Pointer/Pin tip -->
        <path d="M30 55 L40 75 L50 55" fill="url(#eventGrad-${safeEventId})" filter="url(#eventGlow-${safeEventId})"/>
      </svg>

      <!-- Icon/Image overlay -->
      <div class="giant-pin-icon-overlay" style="display: flex; align-items: center; justify-content: center; height: 100%; border-radius: 50%; overflow: hidden;">
        ${
					event.coverImage || event.cover_image || event.Image_URL1
						? `<img src="${event.coverImage || event.cover_image || event.Image_URL1}" class="w-full h-full object-cover" />`
						: safeIconUrl
							? `<img src="${safeIconUrl}" class="w-7 h-7 object-contain" />`
							: `<span style="font-size: 24px;">${escapeHtml(event.icon || "🎪")}</span>`
				}
      </div>

      <!-- Label -->
      <div class="giant-pin-label-new">${safeLabel}</div>
    </div>
  `;

	el.style.cursor = "pointer";
	return el;
};
