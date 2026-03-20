const DEFAULT_LINE1_MAX = 24;
const DEFAULT_LINE2_MAX = 22;

export const NEON_PALETTE_FAMILIES = [
	{
		id: "plasma-pink",
		frame: "#ff4d9d",
		glow: "rgba(255,77,157,0.72)",
		accent: "#6af5ff",
		text: "#fff9ff",
		subline: "#ffd8ee",
		bgTop: "#2f0d25",
		bgBottom: "#09040f",
	},
	{
		id: "electric-cyan",
		frame: "#4ae3ff",
		glow: "rgba(74,227,255,0.68)",
		accent: "#ffd86b",
		text: "#f4feff",
		subline: "#d5f8ff",
		bgTop: "#0d2432",
		bgBottom: "#05090f",
	},
	{
		id: "volt-lime",
		frame: "#8aff4a",
		glow: "rgba(138,255,74,0.66)",
		accent: "#64d9ff",
		text: "#f9fff3",
		subline: "#ddffd1",
		bgTop: "#1a2b11",
		bgBottom: "#070a05",
	},
	{
		id: "sunset-amber",
		frame: "#ffc14a",
		glow: "rgba(255,193,74,0.64)",
		accent: "#ff6b9e",
		text: "#fffaf1",
		subline: "#ffe9bf",
		bgTop: "#33240d",
		bgBottom: "#100b05",
	},
	{
		id: "ultra-cyan",
		frame: "#b07bff",
		glow: "rgba(176,123,255,0.68)",
		accent: "#67f2ff",
		text: "#faf5ff",
		subline: "#eadbff",
		bgTop: "#221237",
		bgBottom: "#08050f",
	},
	{
		id: "ruby-neon",
		frame: "#ff5d63",
		glow: "rgba(255,93,99,0.67)",
		accent: "#76f6d0",
		text: "#fff7f7",
		subline: "#ffd8db",
		bgTop: "#321316",
		bgBottom: "#0f0506",
	},
	{
		id: "aqua-mint",
		frame: "#59ffc6",
		glow: "rgba(89,255,198,0.67)",
		accent: "#7cb4ff",
		text: "#f5fff9",
		subline: "#d5ffed",
		bgTop: "#113024",
		bgBottom: "#050f0b",
	},
	{
		id: "laser-blue",
		frame: "#6f95ff",
		glow: "rgba(111,149,255,0.69)",
		accent: "#ffd066",
		text: "#f6f8ff",
		subline: "#dce5ff",
		bgTop: "#111f39",
		bgBottom: "#05070f",
	},
];

export const NEON_SHAPES = [
	"rounded-rect",
	"capsule",
	"ticket",
	"double-line",
	"bevel",
	"pill",
];

export const NEON_BORDER_STYLES = [
	"single-line",
	"double-line",
	"dashed",
	"dotted",
	"corner-bright",
	"halo-frame",
];

export const NEON_BADGE_STYLES = [
	"badge-top-right",
	"badge-top-left",
	"badge-right-inline",
	"badge-bottom-right",
	"badge-dot",
	"badge-none",
];

export const NEON_GLOW_LEVELS = ["soft", "medium", "strong"];

export const NEON_TYPOGRAPHY_VARIANTS = [
	"display",
	"narrow",
	"mono",
	"headline",
];

const CATEGORY_ICON_SETS = [
	{
		match: ["bar", "club", "night", "cocktail", "beer"],
		icons: ["cocktail", "music", "spark", "night"],
	},
	{
		match: ["cafe", "coffee", "bakery", "dessert", "tea"],
		icons: ["coffee", "cup", "bean", "dessert"],
	},
	{
		match: ["food", "restaurant", "street", "eat", "khao"],
		icons: ["fork", "bowl", "spice", "flame"],
	},
	{
		match: ["art", "gallery", "studio", "creative"],
		icons: ["art", "star", "gem", "spark"],
	},
	{
		match: ["vegan", "organic", "healthy", "salad"],
		icons: ["leaf", "eco", "seed", "spark"],
	},
];

const STATUS_FALLBACK = {
	LIVE: "LIVE NOW",
	OPEN: "OPEN NOW",
	ACTIVE: "OPEN NOW",
	TONIGHT: "TONIGHT",
	CLOSED: "CLOSED",
	OFF: "OFFLINE",
};

const toSafeString = (value) =>
	value === null || value === undefined ? "" : String(value).trim();

const compactWhitespace = (value) => toSafeString(value).replace(/\s+/g, " ");

const toDisplayUppercase = (value) => compactWhitespace(value).toUpperCase();

const truncate = (value, maxLen) => {
	const safe = compactWhitespace(value);
	if (!safe) return "";
	const limit = Math.max(4, Number(maxLen) || 0);
	if (safe.length <= limit) return safe;
	return `${safe.slice(0, Math.max(1, limit - 3)).trim()}...`;
};

const fnv1aHash = (input) => {
	const value = String(input ?? "");
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const resolveCategory = (shop = {}) =>
	compactWhitespace(
		shop.category || shop.primary_category || shop.type || shop.genre || "",
	);

const resolveCityZone = (shop = {}) =>
	compactWhitespace(
		shop.city_zone ||
			shop.cityZone ||
			shop.zone ||
			shop.district ||
			shop.area ||
			shop.city ||
			shop.province ||
			"",
	);

const resolveNameSlug = (shop = {}) => {
	const candidate = compactWhitespace(
		shop.name_slug ||
			shop.nameSlug ||
			shop.slug ||
			shop.name ||
			shop.title ||
			"",
	).toLowerCase();
	return candidate.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
};

const resolveVibeTag = (shop = {}) => {
	const direct = compactWhitespace(
		shop.vibeTag || shop.vibe_tag || shop.vibe || "",
	);
	if (direct) return direct;
	if (Array.isArray(shop.vibe_tags) && shop.vibe_tags.length) {
		return compactWhitespace(shop.vibe_tags[0]);
	}
	if (Array.isArray(shop.tags) && shop.tags.length) {
		return compactWhitespace(shop.tags[0]);
	}
	return "";
};

const resolveStatusSubline = (shop = {}) => {
	const statusRaw = toSafeString(
		shop.status || shop.state || shop.pin_state || shop.open_status || "",
	).toUpperCase();
	if (!statusRaw) return "";
	return STATUS_FALLBACK[statusRaw] || statusRaw;
};

const resolveIconSet = (category) => {
	const lower = toSafeString(category).toLowerCase();
	if (!lower) return ["spark", "star", "dot", "wave"];
	for (const group of CATEGORY_ICON_SETS) {
		if (group.match.some((needle) => lower.includes(needle))) {
			return group.icons;
		}
	}
	return ["spark", "star", "dot", "wave"];
};

const resolveLodPriority = (shop = {}, selectedShopId = null) => {
	const id = toSafeString(shop.id || shop.shop_id || "");
	if (id && selectedShopId && id === toSafeString(selectedShopId)) return 10000;
	const visibilityScore = Number(
		shop.visibility_score ?? shop.visibilityScore ?? 0,
	);
	const boosted =
		shop.boost === true ||
		shop.boost_active === true ||
		shop.is_boost_active === true;
	const live =
		String(shop.status || "").toUpperCase() === "LIVE" ||
		String(shop.pin_state || "").toLowerCase() === "live";
	let score = Number.isFinite(visibilityScore) ? visibilityScore : 0;
	if (boosted) score += 20;
	if (live) score += 12;
	return Math.round(score * 10);
};

const buildSignatureSeed = (
	shop = {},
	{ signatureVersion = "2-stable", experimentId = "stable" } = {},
) => {
	const id = toSafeString(shop.id || shop.shop_id || "").toLowerCase();
	const category = resolveCategory(shop).toLowerCase();
	const cityZone = resolveCityZone(shop).toLowerCase();
	const nameSlug = resolveNameSlug(shop);
	const lat = Number(shop.lat ?? shop.latitude);
	const lng = Number(shop.lng ?? shop.longitude);
	const latSig = Number.isFinite(lat) ? lat.toFixed(4) : "";
	const lngSig = Number.isFinite(lng) ? lng.toFixed(4) : "";
	const stableId = id || `${nameSlug || "shop"}:${latSig}:${lngSig}`;
	return `${stableId}|${category}|${cityZone}|${nameSlug}|${signatureVersion}|${experimentId}`;
};

export const hashNeonKey = (shop = {}, options = {}) => {
	const seed = buildSignatureSeed(shop, options);
	const category = resolveCategory(shop);
	return fnv1aHash(`${seed}|${category}`);
};

export const normalizeNeonText = (
	text,
	{ maxLen = DEFAULT_LINE1_MAX, uppercase = true } = {},
) => {
	const trimmed = truncate(text, maxLen);
	if (!trimmed) return "";
	return uppercase ? toDisplayUppercase(trimmed) : trimmed;
};

export const buildNeonSubline = (shop = {}) => {
	const vibeTag = resolveVibeTag(shop);
	if (vibeTag) {
		return normalizeNeonText(vibeTag, {
			maxLen: DEFAULT_LINE2_MAX,
			uppercase: true,
		});
	}
	const category = resolveCategory(shop);
	if (category) {
		return normalizeNeonText(category, {
			maxLen: DEFAULT_LINE2_MAX,
			uppercase: true,
		});
	}
	const status = resolveStatusSubline(shop);
	if (status) {
		return normalizeNeonText(status, {
			maxLen: DEFAULT_LINE2_MAX,
			uppercase: true,
		});
	}
	return "VIBECITY";
};

export const resolveNeonPalette = (paletteId) =>
	NEON_PALETTE_FAMILIES.find((palette) => palette.id === paletteId) ||
	NEON_PALETTE_FAMILIES[0];

export function useNeonSignTheme() {
	const getNeonDescriptor = (
		shop = {},
		{
			selectedShopId = null,
			experimentId = "stable",
			signatureVersion = "2-stable",
			clientVersion = "unknown",
		} = {},
	) => {
		const hash = hashNeonKey(shop, { signatureVersion, experimentId });
		const signatureSeed = buildSignatureSeed(shop, {
			signatureVersion,
			experimentId,
		});
		const signatureHash = fnv1aHash(signatureSeed);
		const signatureToken = signatureHash.toString(36);
		const palette = NEON_PALETTE_FAMILIES[hash % NEON_PALETTE_FAMILIES.length];
		const shape = NEON_SHAPES[(hash >>> 3) % NEON_SHAPES.length];
		const borderStyle =
			NEON_BORDER_STYLES[(hash >>> 5) % NEON_BORDER_STYLES.length];
		const badgeStyle =
			NEON_BADGE_STYLES[(hash >>> 9) % NEON_BADGE_STYLES.length];
		const glowLevel = NEON_GLOW_LEVELS[(hash >>> 13) % NEON_GLOW_LEVELS.length];
		const typographyVariant =
			NEON_TYPOGRAPHY_VARIANTS[(hash >>> 15) % NEON_TYPOGRAPHY_VARIANTS.length];
		const category = resolveCategory(shop);
		const iconSet = resolveIconSet(category);
		const icon = iconSet[(hash >>> 7) % iconSet.length];
		const variant = `v${(hash % 24) + 1}`;
		const nameLine = normalizeNeonText(
			shop.name || shop.title || "Unnamed Shop",
			{
				maxLen: DEFAULT_LINE1_MAX,
				uppercase: true,
			},
		);
		const subline = buildNeonSubline(shop);
		const neonSignatureVersion = `${signatureVersion}`;
		const neonSignatureV2 = `${neonSignatureVersion}:${experimentId}:${signatureToken}`;
		const neonKey = [
			"neon",
			neonSignatureV2,
			palette.id,
			shape,
			borderStyle,
			badgeStyle,
		].join("-");
		const lodPriority = resolveLodPriority(shop, selectedShopId);

		return {
			neon_key: neonKey,
			neon_variant: variant,
			neon_signature_v2: neonSignatureV2,
			neon_signature_version: neonSignatureVersion,
			neon_experiment_id: experimentId,
			neon_client_version: String(clientVersion || "unknown"),
			neon_palette: palette.id,
			neon_shape: shape,
			neon_border_style: borderStyle,
			neon_badge_style: badgeStyle,
			neon_glow_level: glowLevel,
			neon_typography_variant: typographyVariant,
			neon_icon: icon,
			neon_subline: subline,
			neon_lod_priority: lodPriority,
			neon_line1: nameLine,
			neon_line2: subline,
			neon_theme: {
				...palette,
				shape,
				borderStyle,
				badgeStyle,
				glowLevel,
				typographyVariant,
				icon,
				variant,
			},
		};
	};

	const toNeonFeatureProperties = (
		shop = {},
		{
			selectedShopId = null,
			experimentId = "stable",
			signatureVersion = "2-stable",
			clientVersion = "unknown",
		} = {},
	) => {
		const descriptor = getNeonDescriptor(shop, {
			selectedShopId,
			experimentId,
			signatureVersion,
			clientVersion,
		});
		return {
			neon_key: descriptor.neon_key,
			neon_variant: descriptor.neon_variant,
			neon_signature_v2: descriptor.neon_signature_v2,
			neon_signature_version: descriptor.neon_signature_version,
			neon_experiment_id: descriptor.neon_experiment_id,
			neon_border_style: descriptor.neon_border_style,
			neon_badge_style: descriptor.neon_badge_style,
			neon_glow_level: descriptor.neon_glow_level,
			neon_typography_variant: descriptor.neon_typography_variant,
			neon_palette: descriptor.neon_palette,
			neon_shape: descriptor.neon_shape,
			neon_icon: descriptor.neon_icon,
			neon_subline: descriptor.neon_subline,
			neon_lod_priority: descriptor.neon_lod_priority,
			neon_line1: descriptor.neon_line1,
			neon_line2: descriptor.neon_line2,
		};
	};

	return {
		getNeonDescriptor,
		toNeonFeatureProperties,
	};
}
