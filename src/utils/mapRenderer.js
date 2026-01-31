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

/**
 * Creates the HTML string for the Mapbox Popup
 */
export const createPopupHTML = ({
	item,
	isDarkMode,
	hasCoins,
	roadDistance,
	roadDuration,
	tt, // translation function
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

	const openHours = item.open_hours || item.Open || "";

	return `
    <div class="vibe-popup ${bgClass} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border-2 border-white/20 overflow-hidden w-[280px] backdrop-blur-3xl" data-shop-id="${item.id}">
     <div class="relative w-full aspect-[9/16] max-h-[360px] overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-700 via-pink-600 to-red-600"></div>
        ${
					item.Image_URL1
						? `<img src="${item.Image_URL1}" class="absolute inset-0 w-full h-full object-cover" />`
						: ""
				}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

        <div class="absolute top-2 left-2 flex flex-col gap-1">
          ${isLive ? `<div class="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse">● LIVE</div>` : ""}
          ${hasCoins ? `<div class="px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[9px] font-black">🪙 +10</div>` : ""}
        </div>

        <button class="popup-close-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-sm font-black border-2 border-white/20 z-10">✕</button>

        <!-- Info Overlay -->
        <div class="absolute bottom-3 left-3 right-3">
          <h3 class="text-sm font-black leading-tight mb-0.5 truncate uppercase text-white drop-shadow-lg">${item.name}</h3>
          <div class="text-[10px] font-black text-white/80 uppercase tracking-widest">${item.category || "Venue"}</div>
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

        ${openHours ? `<div class="text-[10px] font-black mb-1.5">🕐 ${openHours}</div>` : ""}

        <p class="text-[11px] font-bold leading-relaxed mb-2">${shortDesc}</p>

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
 * Creates the DOM element for a map marker
 */
export const createMarkerElement = ({
	item,
	isHighlighted,
	isLive,
	hasCoins, // boolean
}) => {
	const el = document.createElement("div");
	el.className = `vibe-marker ${isLive ? "vibe-marker-live" : ""} ${isHighlighted ? "vibe-marker-active" : ""}`;
	el.dataset.shopId = item.id;

	const size = isHighlighted ? 44 : 30;

	// HTML content for marker
	el.innerHTML = `
    <div class="marker-wrapper ${isHighlighted ? "highlighted-marker" : ""} ${isLive ? "live-marker" : ""}" style="width: ${size}px; height: ${size + 12}px; position: relative;">
      ${
				isLive
					? `
        <div class="live-pulse-ring-outer"></div>
        <div class="live-pulse-ring-inner"></div>
        <div class="live-pulse-core"></div>
      `
					: ""
			}

      <div
        class="marker-pin-shape"
        style="
           width: ${size}px;
           height: ${size}px;
           background: ${isLive ? "#FF2D55" : isHighlighted ? "#3B82F6" : "#27272a"};
           border: 2px solid white;
           border-radius: 50% 50% 50% 0;
           transform: rotate(-45deg);
           box-shadow: 0 4px 10px rgba(0,0,0,0.5);
           position: absolute;
           top: 0;
           left: 0;
           display: flex;
           align-items: center;
           justify-content: center;
           overflow: hidden;
        "
      >
         <div style="transform: rotate(45deg); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
             ${
								item.Image_URL1
									? `<img src="${item.Image_URL1}" style="width: 100%; height: 100%; object-cover; border-radius: 50%;" />`
									: `<span style="font-size: ${size * 0.4}px;">📍</span>`
							}
         </div>
      </div>

      ${
				hasCoins
					? `<div class="coin-badge absolute -top-2 -right-2 bg-yellow-400 text-black text-[8px] font-black px-1 rounded-full border border-white shadow-sm animate-bounce">🪙</div>`
					: ""
			}
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
	el.dataset.eventId = event.id;

	// Premium SVG-based event marker
	el.innerHTML = `
    <div class="giant-pin-wrapper">
      <svg class="giant-pin-svg" width="80" height="100" viewBox="0 0 80 100" fill="none">
        <defs>
          <!-- Premium gradient -->
          <linearGradient id="eventGrad-${event.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8B5CF6"/>
            <stop offset="50%" stop-color="#EC4899"/>
            <stop offset="100%" stop-color="#F43F5E"/>
          </linearGradient>
          <!-- Glow filter -->
          <filter id="eventGlow-${event.id}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <!-- Inner shadow -->
          <filter id="eventInner-${event.id}">
            <feOffset dx="0" dy="2"/>
            <feGaussianBlur stdDeviation="2"/>
            <feComposite operator="out" in="SourceGraphic"/>
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.3 0"/>
            <feBlend in="SourceGraphic"/>
          </filter>
        </defs>

        <!-- Outer glow ring (animated) -->
        <circle cx="40" cy="35" r="30" fill="none" stroke="url(#eventGrad-${event.id})" stroke-width="2" opacity="0.5" class="pulse-ring"/>

        <!-- Main body -->
        <circle cx="40" cy="35" r="28" fill="url(#eventGrad-${event.id})" filter="url(#eventGlow-${event.id})"/>

        <!-- Highlight -->
        <ellipse cx="40" cy="28" rx="16" ry="10" fill="white" opacity="0.2"/>

        <!-- Icon circle -->
        <circle cx="40" cy="35" r="18" fill="rgba(255,255,255,0.15)"/>

        <!-- Pointer/Pin tip -->
        <path d="M30 55 L40 75 L50 55" fill="url(#eventGrad-${event.id})" filter="url(#eventGlow-${event.id})"/>
      </svg>

      <!-- Icon overlay -->
      <div class="giant-pin-icon-overlay" style="display: flex; align-items: center; justify-content: center; height: 100%;">
        ${
					event.icon &&
					(event.icon.includes("http") || event.icon.includes("/"))
						? `<img src="${event.icon}" class="w-7 h-7 object-contain" />`
						: `<span style="font-size: 24px;">${event.icon || "🎪"}</span>`
				}
      </div>

      <!-- Label -->
      <div class="giant-pin-label-new">${event.shortName || event.name}</div>
    </div>
  `;

	el.style.cursor = "pointer";
	return el;
};
