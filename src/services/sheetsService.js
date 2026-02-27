import axios from "axios";
import Papa from "papaparse";

// ─── Anonymous Analytics Logger ──────────────────────────────────────────────
// Uses VITE_GOOGLE_SHEET_URL_ORDERS / VITE_GOOGLE_SHEET_URL_STATS (Apps Script)
const _ORDERS_URL = import.meta.env.VITE_GOOGLE_SHEET_URL_ORDERS || "";
const _STATS_URL = import.meta.env.VITE_GOOGLE_SHEET_URL_STATS || "";
const _BATCH_SIZE = 20;
const _FLUSH_MS = 8_000;
const _statsBatch = [];
let _flushTimer = null;

const _getVid = () => {
	try {
		return localStorage.getItem("vibe_visitor_id") || "anon";
	} catch {
		return "anon";
	}
};
const _post = async (url, payload) => {
	if (!url) return;
	try {
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			keepalive: true,
		});
	} catch {
		/* silent */
	}
};
const _flush = () => {
	if (!_statsBatch.length) return;
	_post(_STATS_URL, { rows: _statsBatch.splice(0, _BATCH_SIZE) });
};

/**
 * Log anonymous user event to Stats sheet (batched, fire-and-forget).
 * @param {string} eventType - 'shop_view' | 'search' | 'location_grant' | etc.
 * @param {object} data
 */
export const logUserEvent = (eventType, data = {}) => {
	_statsBatch.push({
		timestamp: new Date().toISOString(),
		visitor_id: _getVid(),
		event_type: eventType,
		lat: data.lat ?? "",
		lng: data.lng ?? "",
		shop_id: data.shopId ?? "",
		shop_name: data.shopName ?? "",
		query: data.query ?? "",
		ua:
			typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : "",
	});
	clearTimeout(_flushTimer);
	if (_statsBatch.length >= _BATCH_SIZE) {
		_flush();
		return;
	}
	_flushTimer = setTimeout(_flush, _FLUSH_MS);
};

/**
 * Log payment transaction to Orders sheet (immediate, fire-and-forget).
 */
export const logPaymentTransaction = ({
	amount,
	currency = "THB",
	shopId = "",
	shopName = "",
	chargeId = "",
	status = "success",
} = {}) => {
	_post(_ORDERS_URL, {
		rows: [
			{
				timestamp: new Date().toISOString(),
				visitor_id: _getVid(),
				amount,
				currency,
				shop_id: shopId,
				shop_name: shopName,
				charge_id: chargeId,
				status,
			},
		],
	});
};
// ─────────────────────────────────────────────────────────────────────────────

const getVal = (obj, key) => {
	const foundKey = Object.keys(obj).find(
		(k) => k.trim().toLowerCase() === key.toLowerCase(),
	);
	const value = foundKey ? obj[foundKey] : "";
	return typeof value === "string" ? value.trim() : "";
};

export const fetchShopData = async (sheetUrl) => {
	try {
		// Handle both local files and remote URLs
		let finalUrl = sheetUrl;

		// Only add cache buster for remote URLs
		if (sheetUrl.startsWith("http")) {
			const cacheBuster = `&t=${Date.now()}`;
			finalUrl = sheetUrl.includes("?")
				? `${sheetUrl}${cacheBuster}`
				: `${sheetUrl}?${cacheBuster}`;
		}

		const response = await axios.get(finalUrl);

		const parsedData = Papa.parse(response.data, {
			header: true,
			skipEmptyLines: true,
		});

		return parsedData.data
			.filter((item) => getVal(item, "Name") && getVal(item, "Latitude"))
			.map((item, index) => {
				const img1 = getVal(item, "Image_URL1");
				const img2 = getVal(item, "Image_URL2");

				return {
					id: index,
					name: getVal(item, "Name"),
					category: getVal(item, "Category") || "General",
					lat: parseFloat(getVal(item, "Latitude")),
					lng: parseFloat(getVal(item, "Longitude")),
					videoUrl: getVal(item, "Video_URL"),

					// เก็บค่า Status เดิมจาก Sheet เอาไว้ใช้ Override
					originalStatus: getVal(item, "Status").toUpperCase() || "",
					status: getVal(item, "Status").toUpperCase() || "OFF",

					vibeTag: getVal(item, "Vibe_Info"),
					crowdInfo: getVal(item, "Crowd_Info"),

					promotionInfo: getVal(item, "Promotion_info"),
					promotionEndtime: getVal(item, "Promotion_endtime"),

					// --- Time Ranges ---
					openTime: getVal(item, "open_time"),
					closeTime: getVal(item, "close_time"),
					goldenStart: getVal(item, "golden_time"),
					goldenEnd: getVal(item, "end_golden_time"),

					// --- Zone & Building Navigation ---
					Province: getVal(item, "Province") || "เชียงใหม่",
					Zone: getVal(item, "Zone") || null,
					Building: getVal(item, "Building") || null,
					Floor: getVal(item, "Floor") || null,
					CategoryColor: getVal(item, "CategoryColor") || null,

					images: [img1, img2].filter((url) => url && url.length > 5),
					Image_URL1: img1,
					Image_URL2: img2,

					// --- Social & High Fidelity Data ---
					IG_URL: getVal(item, "IG_URL"),
					FB_URL: getVal(item, "FB_URL"),
					TikTok_URL: getVal(item, "TikTok_URL"),
					isPromoted: getVal(item, "IsPromoted").toUpperCase() === "TRUE",
				};
			});
	} catch (error) {
		console.error("Error fetching Sheets data:", error);
		throw new Error("Unable to load data from Google Sheets");
	}
};
