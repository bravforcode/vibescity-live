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
		const base = globalThis.location?.origin || "https://vibescity.live";
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

const SVG_NS = "http://www.w3.org/2000/svg";

const createSvgElement = (tagName, attributes = {}) => {
	const element = document.createElementNS(SVG_NS, tagName);
	Object.entries(attributes).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			element.setAttribute(key, String(value));
		}
	});
	return element;
};

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
	const rawMediaCounts =
		item?.media_counts ||
		item?.mediaCounts ||
		(media?.counts && typeof media.counts === "object" ? media.counts : null) ||
		{};
	const realImageCount = Number(rawMediaCounts?.images || 0);
	const realVideoCount = Number(rawMediaCounts?.videos || 0);
	const realTotalCount = Number(
		rawMediaCounts?.total || realImageCount + realVideoCount,
	);
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

	const mediaBadges = [];
	if (realImageCount > 0) {
		mediaBadges.push(
			`<span class="rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2 py-0.5 text-[8px] font-black uppercase text-cyan-100">IMG ${realImageCount}</span>`,
		);
	}
	if (realVideoCount > 0) {
		mediaBadges.push(
			`<span class="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/15 px-2 py-0.5 text-[8px] font-black uppercase text-fuchsia-100">VID ${realVideoCount}</span>`,
		);
	}
	if (!mediaBadges.length) {
		mediaBadges.push(
			`<span class="rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[8px] font-bold uppercase text-white/80">${realTotalCount > 0 ? `Gallery ${realTotalCount}` : "No media"}</span>`,
		);
	}

	// Real venue image only
	const imageUrl = sanitizeUrl(media?.primaryImage || "");
	const fallbackPoster = `
		<div class="absolute inset-0 bg-gradient-to-br ${stripGradient}" style="opacity:0.95;"></div>
		<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_42%)]"></div>
		<div class="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
			<div class="min-w-0">
				<p class="truncate text-[8px] font-black uppercase tracking-[0.24em] text-white/65">${safeCategory}</p>
				<p class="mt-1 truncate text-[11px] font-black text-white">${safeName || "Venue"}</p>
			</div>
		</div>
	`;
	const imageHtml = `
		<div
			class="relative overflow-hidden"
			data-testid="popup-media"
			style="height:clamp(90px,20vw,100px);flex-shrink:0;background:#0f172a;"
		>
			${fallbackPoster}
			${
				imageUrl
					? `<img src="${imageUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" decoding="async" onerror="this.remove()">`
					: ""
			}
			<div class="absolute right-2 bottom-2 z-[1] flex flex-wrap items-center justify-end gap-1">
				${mediaBadges.join("")}
			</div>
		</div>
	`;

	return `
    <div class="vibe-popup bg-zinc-900/95 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] border border-white/10 overflow-hidden w-[230px]" data-shop-id="${safeShopId}" style="position:relative;">

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

	const safeName = String(item.name || "VIBE");
	const truncated = safeName.length > 14 ? safeName.substring(0, 14) : safeName;

	if (hasCoins) {
		const coin = document.createElement("div");
		coin.className = "neon-coin-float lottie-coin-target";
		el.appendChild(coin);
	}

	const text = document.createElement("span");
	text.className = "neon-sign-text";
	text.textContent = truncated;
	el.appendChild(text);

	if (isLive) {
		const badge = document.createElement("span");
		badge.className = "neon-sign-badge";
		badge.textContent = "LIVE";
		el.appendChild(badge);
	}

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

	const wrapper = document.createElement("div");
	wrapper.className = "giant-pin-wrapper";

	const svg = createSvgElement("svg", {
		class: "giant-pin-svg",
		width: "72",
		height: "92",
		viewBox: "0 0 72 92",
		fill: "none",
	});

	const defs = createSvgElement("defs");
	const gradient = createSvgElement("linearGradient", {
		id: `eventGrad-${safeEventId}`,
		x1: "0%",
		y1: "0%",
		x2: "100%",
		y2: "100%",
	});
	gradient.append(
		createSvgElement("stop", { offset: "0%", "stop-color": "#8B5CF6" }),
		createSvgElement("stop", { offset: "50%", "stop-color": "#EC4899" }),
		createSvgElement("stop", { offset: "100%", "stop-color": "#F43F5E" }),
	);

	const glowFilter = createSvgElement("filter", {
		id: `eventGlow-${safeEventId}`,
		x: "-50%",
		y: "-50%",
		width: "200%",
		height: "200%",
	});
	const glowBlur = createSvgElement("feGaussianBlur", {
		stdDeviation: "4",
		result: "blur",
	});
	const glowMerge = createSvgElement("feMerge");
	glowMerge.append(
		createSvgElement("feMergeNode", { in: "blur" }),
		createSvgElement("feMergeNode", { in: "SourceGraphic" }),
	);
	glowFilter.append(glowBlur, glowMerge);

	const innerFilter = createSvgElement("filter", {
		id: `eventInner-${safeEventId}`,
	});
	innerFilter.append(
		createSvgElement("feOffset", { dx: "0", dy: "2" }),
		createSvgElement("feGaussianBlur", { stdDeviation: "2" }),
		createSvgElement("feComposite", {
			operator: "out",
			in: "SourceGraphic",
		}),
		createSvgElement("feColorMatrix", {
			type: "matrix",
			values: "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.3 0",
		}),
		createSvgElement("feBlend", { in: "SourceGraphic" }),
	);

	defs.append(gradient, glowFilter, innerFilter);

	svg.append(
		defs,
		createSvgElement("circle", {
			cx: "36",
			cy: "31",
			r: "24",
			fill: "none",
			stroke: `url(#eventGrad-${safeEventId})`,
			"stroke-width": "2",
			opacity: "0.45",
			class: "pulse-ring",
		}),
		createSvgElement("circle", {
			cx: "36",
			cy: "31",
			r: "22",
			fill: `url(#eventGrad-${safeEventId})`,
			filter: `url(#eventGlow-${safeEventId})`,
		}),
		createSvgElement("ellipse", {
			cx: "36",
			cy: "25",
			rx: "12",
			ry: "8",
			fill: "white",
			opacity: "0.24",
		}),
		createSvgElement("circle", {
			cx: "36",
			cy: "31",
			r: "12",
			fill: "rgba(255,255,255,0.15)",
		}),
		createSvgElement("circle", {
			cx: "36",
			cy: "31",
			r: "6",
			fill: "rgba(255,255,255,0.22)",
		}),
		createSvgElement("path", {
			d: "M28 49 L36 69 L44 49",
			fill: `url(#eventGrad-${safeEventId})`,
			filter: `url(#eventGlow-${safeEventId})`,
		}),
	);

	wrapper.append(svg);
	el.appendChild(wrapper);

	el.style.cursor = "pointer";
	return el;
};
