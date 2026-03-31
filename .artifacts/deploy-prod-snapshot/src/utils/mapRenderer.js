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

const NEON_CATEGORY_COLORS = {
	bar: "#ff00ff",
	cocktail: "#ff00ff",
	nightclub: "#ff00ff",
	music: "#ff4444",
	live: "#ff4444",
	food: "#00ff88",
	street: "#00ff88",
	market: "#00ff88",
	cannabis: "#44ff44",
	edible: "#44ff44",
	cafe: "#ffdd00",
	gallery: "#ffdd00",
	art: "#ffdd00",
	spa: "#ffdd00",
};

const getNeonColor = (category) => {
	const lower = String(category || "").toLowerCase();
	for (const [key, color] of Object.entries(NEON_CATEGORY_COLORS)) {
		if (lower.includes(key)) return color;
	}
	return "#00e5ff";
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
	isDarkMode: _isDarkMode,
	hasCoins: _hasCoins,
	roadDistance,
	roadDuration: _roadDuration,
	_tt, // translation function
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

	// Compact distance text (inline, no absolute positioning)
	let distanceTxt = "";
	if (roadDistance) {
		distanceTxt =
			roadDistance < 1000
				? `${Math.round(roadDistance)} m`
				: `${(roadDistance / 1000).toFixed(1)} km`;
	} else if (item.distance !== undefined) {
		distanceTxt =
			item.distance < 1
				? `${(item.distance * 1000).toFixed(0)} m`
				: `${item.distance.toFixed(1)} km`;
	}
	const distanceBadge = distanceTxt
		? `<span class="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] font-black border border-white/20">📍 ${distanceTxt}</span>`
		: "";

	const safeShopId = sanitizeId(item.id);

	const statusBadge = isEvent
		? `<span class="px-1 py-0.5 rounded-full bg-purple-600 text-white text-[8px] font-black leading-none">● EVENT</span>`
		: isLive
			? `<span class="px-1 py-0.5 rounded-full bg-red-600 text-white text-[8px] font-black leading-none animate-pulse">● LIVE</span>`
			: `<span class="px-1 py-0.5 rounded-full bg-zinc-600 text-white/70 text-[8px] font-black leading-none">● OFF</span>`;

	// Gradient accent colour per status
	const stripGradient = isLive
		? "from-red-700 via-pink-700 to-purple-800"
		: isEvent
			? "from-purple-800 via-violet-700 to-indigo-800"
			: "from-zinc-800 via-zinc-700 to-zinc-800";

	// Venue image (uses primary image from Supabase or Google Places)
	const imageUrl = sanitizeUrl(
		media?.primaryImage || item?.Image_URL1 || item?.image_url || "",
	);
	const fallbackPoster = `
		<div class="absolute inset-0 bg-gradient-to-br ${stripGradient}" style="opacity:0.95;"></div>
		<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_42%)]"></div>
		<div class="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
			<div class="min-w-0">
				<p class="truncate text-[8px] font-black uppercase tracking-[0.24em] text-white/65">${safeCategory}</p>
				<p class="mt-1 truncate text-[11px] font-black text-white">${safeName || "Venue"}</p>
			</div>
			<span class="rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[8px] font-bold uppercase text-white/80">Media</span>
		</div>
	`;
	const imageHtml = `
		<div
			class="relative overflow-hidden"
			data-testid="popup-media"
			style="height:clamp(72px,18vw,88px);flex-shrink:0;background:#0f172a;"
		>
			${fallbackPoster}
			${
				imageUrl
					? `<img src="${imageUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" decoding="async" onerror="this.remove()">`
					: ""
			}
		</div>
	`;

	return `
    <div class="vibe-popup bg-zinc-900/95 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] border border-white/10 overflow-hidden w-[180px] backdrop-blur-sm" data-shop-id="${safeShopId}" style="position:relative;">

      <div data-testid="popup-live-bar" class="relative h-8 bg-gradient-to-r ${stripGradient} flex items-center gap-1 px-2">
        ${statusBadge}
        <span class="flex-1 text-[10px] font-black text-white uppercase truncate leading-none">${safeName}</span>
        <button type="button" aria-label="Close popup" class="popup-close-btn flex-shrink-0 w-4 h-4 rounded-full bg-black/50 text-white/90 flex items-center justify-center text-[9px] font-black border border-white/20 z-10">✕</button>
      </div>

      ${imageHtml}

      <div class="flex items-center gap-1 px-2 pt-1 pb-0.5">
        <span class="text-[8px] font-bold text-white/50 uppercase tracking-wider truncate flex-1">${safeCategory}</span>
        ${distanceBadge}
      </div>

      <div class="flex items-center justify-between mx-1.5 mb-1.5 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10">
        <div class="flex items-center gap-0.5">
          <span class="text-[7px] font-black text-white/60 uppercase">VIBE</span>
          <div class="flex items-end gap-px">${vibeBars}</div>
        </div>
        <span class="text-[8px] font-black text-white/60">${crowdEmoji} ${crowdText}</span>
      </div>

      <div class="flex gap-1 px-1.5 pb-1.5" style="pointer-events:auto;position:relative;z-index:10;">
        <button type="button" aria-label="Navigate to ${safeName}" class="popup-nav-btn flex-1 flex items-center justify-center gap-0.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white active:scale-95 transition-colors">
          <span class="text-[9px] font-bold">Nav</span>
        </button>
        <button type="button" aria-label="Call ride to ${safeName}" class="popup-ride-btn flex-1 flex items-center justify-center gap-0.5 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-800 text-white border border-white/10 active:scale-95 transition-colors">
          <span class="text-[9px] font-bold">Ride</span>
        </button>
      </div>
    </div>
  `;
};

/**
 * Builds a rectangular neon sign DOM element for a venue marker.
 * All user-supplied strings are sanitized via escapeHtml before use.
 */
export const createMarkerElement = ({
	item,
	isHighlighted,
	isLive,
	hasCoins = true,
}) => {
	const el = document.createElement("div");
	const neonColor = getNeonColor(item.category || item.type || "");
	el.className = `neon-sign-marker${isHighlighted ? " neon-sign-selected" : ""}`;
	el.style.setProperty("--neon-color", neonColor);
	el.dataset.shopId = sanitizeId(item.id);
	el.style.pointerEvents = "auto";

	// escapeHtml applied to all user-supplied strings before innerHTML insertion
	const safeName = escapeHtml(item.name || "VIBE");
	const truncated = safeName.length > 14 ? safeName.substring(0, 14) : safeName;

	const coinHtml = hasCoins
		? '<div class="neon-coin-float lottie-coin-target"></div>'
		: "";
	const badgeHtml = isLive ? '<span class="neon-sign-badge">LIVE</span>' : "";
	const textHtml = `<span class="neon-sign-text">${truncated}</span>`;

	// All interpolated values are either static class strings or escapeHtml-sanitized
	el.innerHTML = coinHtml + textHtml + badgeHtml;

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
          <linearGradient id="eventGrad-${safeEventId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8B5CF6"/>
            <stop offset="50%" stop-color="#EC4899"/>
            <stop offset="100%" stop-color="#F43F5E"/>
          </linearGradient>
          <filter id="eventGlow-${safeEventId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="eventInner-${safeEventId}">
            <feOffset dx="0" dy="2"/>
            <feGaussianBlur stdDeviation="2"/>
            <feComposite operator="out" in="SourceGraphic"/>
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.3 0"/>
            <feBlend in="SourceGraphic"/>
          </filter>
        </defs>
        <circle cx="40" cy="35" r="30" fill="none" stroke="url(#eventGrad-${safeEventId})" stroke-width="2" opacity="0.5" class="pulse-ring"/>
        <circle cx="40" cy="35" r="28" fill="url(#eventGrad-${safeEventId})" filter="url(#eventGlow-${safeEventId})"/>
        <ellipse cx="40" cy="28" rx="16" ry="10" fill="white" opacity="0.2"/>
        <circle cx="40" cy="35" r="18" fill="rgba(255,255,255,0.15)"/>
        <path d="M30 55 L40 75 L50 55" fill="url(#eventGrad-${safeEventId})" filter="url(#eventGlow-${safeEventId})"/>
      </svg>
      <div class="giant-pin-icon-overlay" style="display:flex;align-items:center;justify-content:center;height:100%;border-radius:50%;overflow:hidden;">
        ${
					event.coverImage || event.cover_image || event.Image_URL1
						? `<img src="${event.coverImage || event.cover_image || event.Image_URL1}" class="w-full h-full object-cover" />`
						: safeIconUrl
							? `<img src="${safeIconUrl}" class="w-7 h-7 object-contain" />`
							: `<span style="font-size: 24px;">${escapeHtml(event.icon || "🎪")}</span>`
				}
      </div>
      <div class="giant-pin-label-new">${safeLabel}</div>
    </div>
  `;

	el.style.cursor = "pointer";
	return el;
};
