import { createI18n } from "vue-i18n";
import enJson from "./locales/en.json";
import thJson from "./locales/th.json";

// ✅ Inline messages for keys used by SmartHeader, MapLibreContainer, etc.
// These are MERGED with the JSON locale files, so both sources work together.
const inlineMessages = {
	th: {
		nav: {
			level: "ระดับ {lvl}",
			xp: "XP: {current}/{next}",
			all_categories: "🎯 ทุกประเภท",
			vibes_now: "กำลังฮิตขณะนี้",
			back: "ย้อนกลับ",
		},
		categories: {
			all: "ทั้งหมด",
			food: "อาหาร",
			fashion: "แฟชั่น",
			beauty: "ความงาม",
			tech: "ไอที",
			cinema: "บันเทิง",
			bar: "สังสรรค์",
			cafe: "คาเฟ่",
			music: "ดนตรีสด",
			club: "คลับ",
			cafe_desc: "☕ ดื่มด่ำกับกาแฟพรีเมียมในบรรยากาศสุดชิลล์ เหมาะสำหรับนั่งทำงานหรือพักผ่อน",
			bar_desc: "🍸 บาร์คัดสรรบรรยากาศโดดเด่น พร้อมเครื่องดื่มคราฟต์และดนตรีสุดคลาสสิก",
			club_desc: "🪩 ปลดปล่อยความมันส์กับ DJ ชั้นนำและระบบแสงสีเสียงเต็มรูปแบบ",
			food_desc: "🍽️ สัมผัสรสชาติอาหารเลิศรสที่รังสรรค์จากวัตถุดิบชั้นดีในท้องถิ่น",
			music_desc: "🎸 ฟังดนตรีสดจากวงชื่อดังในบรรยากาศเป็นกันเอง พร้อมเครื่องดื่มเย็นฉ่ำ",
			nightlife_desc: "🌃 แหล่งรวมความบันเทิงยามค่ำคืนที่คุณไม่ควรพลาด",
			shopping_desc: "🛍️ แหล่งรวมสินค้าแฟชั่นและห้างสรรพสินค้าชั้นนำ",
		},
		mall: {
			select_floor: "เลือกชั้น",
			current_floor: "ชั้นปัจจุบัน",
			interactive_map: "แผนที่เดินห้าง",
			highlights: "ไฮไลท์เด็ด",
			navigate: "นำทาง",
			taxi: "เรียกรถ",
			search: "ค้นหาร้านในห้าง…",
		},
		status: {
			open: "เปิดอยู่",
			closed: "ปิดแล้ว",
			live: "มีกิจกรรม",
			tonight: "พบกันคืนนี้",
			vibe_5: "คึกคัก",
			vibe_4: "มาก",
			vibe_3: "ปานกลาง",
			vibe_2: "น้อย",
			vibe_1: "เงียบ",
			off: "ปิด",
			no_shops: "ไม่พบร้านค้า",
		},
		gamification: {
			collect_coins: "สะสมเหรียญ",
			congrats: "ยินดีด้วย!",
			level_up: "เลเวลอัปเป็นระดับ {lvl}!",
			claim_vibe: "รับไวบ์ของคุณ",
			take_me_there: "พาฉันไปที่นั่น",
			vibe_of_hour: "ไวบ์แห่งชั่วโมงนี้",
		},
	},
	en: {
		nav: {
			level: "Level {lvl}",
			xp: "XP: {current}/{next}",
			all_categories: "🎯 All Categories",
			vibes_now: "Vibes Now",
			back: "Back",
		},
		categories: {
			all: "All",
			food: "Food",
			fashion: "Fashion",
			beauty: "Beauty",
			tech: "Tech",
			cinema: "Cinema",
			bar: "Nightlife",
			cafe: "Cafe",
			music: "Live Music",
			club: "Club",
			cafe_desc:
				"☕ Enjoy premium coffee in a chill atmosphere, perfect for work or relaxation.",
			bar_desc:
				"🍸 A standout bar experience with craft drinks and timeless music.",
			club_desc:
				"🪩 Unleash the fun with top DJs and full light and sound systems.",
			food_desc:
				"🍽️ Savor delicious flavors crafted from fine local ingredients.",
			music_desc:
				"🎸 Listen to live music from famous bands in a friendly atmosphere.",
			nightlife_desc: "🌃 A hub of nightlife entertainment you shouldn't miss.",
			shopping_desc:
				"🛍️ A collection of fashion brands and leading department stores.",
		},
		mall: {
			select_floor: "Select Floor",
			current_floor: "Current Floor",
			interactive_map: "Interactive Map",
			highlights: "Hot Highlights",
			navigate: "Navigate",
			taxi: "Ride",
			search: "Search shops in mall…",
		},
		status: {
			open: "OPEN NOW",
			closed: "CLOSED",
			live: "LIVE NOW",
			tonight: "TONIGHT",
			vibe_5: "Very Busy",
			vibe_4: "Crowded",
			vibe_3: "Moderate",
			vibe_2: "Light",
			vibe_1: "Quiet",
			off: "OFF",
			no_shops: "No shops found",
		},
		gamification: {
			collect_coins: "Collect Coins",
			congrats: "Congrats!",
			level_up: "Leveled up to {lvl}!",
			claim_vibe: "CLAIM YOUR VIBE",
			take_me_there: "TAKE ME THERE",
			vibe_of_hour: "VIBE OF THE HOUR",
		},
	},
};

/**
 * Deep merge two objects. Source keys override target keys.
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
function deepMerge(target, source) {
	const output = { ...target };
	for (const key of Object.keys(source)) {
		if (
			source[key] &&
			typeof source[key] === "object" &&
			!Array.isArray(source[key]) &&
			target[key] &&
			typeof target[key] === "object"
		) {
			output[key] = deepMerge(target[key], source[key]);
		} else {
			output[key] = source[key];
		}
	}
	return output;
}

const messageFormatterCache = new Map();
const MESSAGE_TOKEN_RE = /\$\{([^}]+)\}|\{([^}]+)\}/g;

const readNamedPath = (namedValues, token) => {
	if (!namedValues || !token) return undefined;
	if (token in namedValues) return namedValues[token];
	if (!token.includes(".")) return undefined;
	return token
		.split(".")
		.reduce(
			(current, segment) =>
				current && typeof current === "object" ? current[segment] : undefined,
			namedValues,
		);
};

const readMessageParam = (ctx, token) => {
	if (!ctx || !token) return undefined;

	if (/^\d+$/.test(token)) {
		const index = Number(token);
		if (typeof ctx.list === "function") {
			const value = ctx.list(index);
			if (value !== undefined) return value;
		}
		const listValues = Array.isArray(ctx.list)
			? ctx.list
			: Array.isArray(ctx.values)
				? ctx.values
				: Array.isArray(ctx.listValues)
					? ctx.listValues
					: null;
		return listValues?.[index];
	}

	if (typeof ctx.named === "function") {
		const value = ctx.named(token);
		if (value !== undefined) return value;
	}

	const namedValues =
		ctx.namedValues ||
		(typeof ctx.named === "object" && ctx.named ? ctx.named : null) ||
		(typeof ctx.values === "object" && !Array.isArray(ctx.values)
			? ctx.values
			: null) ||
		null;

	const nestedNamedValue = readNamedPath(namedValues, token);
	if (nestedNamedValue !== undefined) {
		return nestedNamedValue;
	}

	return undefined;
};

const createSafeMessageFormatter = (message, cacheKey) => {
	const normalizedMessage = String(message ?? "");
	const existing = messageFormatterCache.get(cacheKey);
	if (existing) return existing;

	const formatter = (ctx = {}) =>
		normalizedMessage.replace(
			MESSAGE_TOKEN_RE,
			(match, templateToken, rawToken) => {
				const token = String(templateToken || rawToken || "").trim();
				if (!token) return "";
				const value = readMessageParam(ctx, token);
				return value === undefined || value === null ? match : String(value);
			},
		);

	messageFormatterCache.set(cacheKey, formatter);
	return formatter;
};

const compileLocaleMessageTree = (localeCode, value, keyPath = "") => {
	if (typeof value === "string") {
		return createSafeMessageFormatter(
			value,
			`${localeCode}:${keyPath || String(value ?? "")}`,
		);
	}
	if (Array.isArray(value)) {
		return value.map((entry, index) =>
			compileLocaleMessageTree(localeCode, entry, `${keyPath}[${index}]`),
		);
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			compileLocaleMessageTree(
				localeCode,
				entry,
				keyPath ? `${keyPath}.${key}` : key,
			),
		]),
	);
};

// ✅ Merge JSON locale files with inline messages, then precompile leaf strings
// into CSP-safe formatter functions so the runtime-only vue-i18n build is enough.
const messages = {
	en: compileLocaleMessageTree("en", deepMerge(enJson, inlineMessages.en)),
	th: compileLocaleMessageTree("th", deepMerge(thJson, inlineMessages.th)),
};

// ✅ Locale persistence (remember selected language)
// Default to English, Thai available in settings
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "th"]);

const readCookie = (name) => {
	if (typeof document === "undefined") return "";
	const target = `${name}=`;
	return document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(target))
		?.slice(target.length);
};

const detectBrowserLocale = () => {
	return DEFAULT_LOCALE;
};

const resolveInitialLocale = () => {
	if (typeof window === "undefined") return DEFAULT_LOCALE;
	const savedLocale =
		localStorage.getItem("locale") || readCookie("vibe_locale") || "";
	const normalized = String(savedLocale || "")
		.trim()
		.toLowerCase();
	if (SUPPORTED_LOCALES.has(normalized)) return normalized;
	return detectBrowserLocale();
};

const locale = resolveInitialLocale();

const i18n = createI18n({
	legacy: false, // Composition API
	globalInjection: true,
	locale,
	fallbackLocale: "en",
	messages,
	// ✅ Show missing key warnings only in dev mode
	missingWarn: import.meta.env.DEV,
	fallbackWarn: import.meta.env.DEV,
});

export default i18n;
