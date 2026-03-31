/**
 * src/utils/shopUtils.js
 * รวม Business Logic ทั้งหมดของร้านค้า
 */

// --- Time Helper Functions ---

const parseToMinutes = (timeStr) => {
	if (!timeStr) return -1;
	const normalized = timeStr.replace(".", ":");
	const [h, m] = normalized.split(":").map(Number);
	if (isNaN(h) || isNaN(m)) return -1;
	return h * 60 + m;
};

// Haversine formula to calculate distance in km
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
	if (!lat1 || !lon1 || !lat2 || !lon2) return null;
	const R = 6371; // Earth radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
};

const isTimeInRange = (startStr, endStr, nowObj) => {
	const start = parseToMinutes(startStr);
	const end = parseToMinutes(endStr);

	if (start === -1 || end === -1) return false;

	const currentMinutes = nowObj.getHours() * 60 + nowObj.getMinutes();

	if (end < start) {
		// กรณีข้ามคืน (เช่น 22:00 - 02:00)
		return currentMinutes >= start || currentMinutes < end;
	} else {
		// กรณีปกติ (เช่น 08:00 - 17:00)
		return currentMinutes >= start && currentMinutes < end;
	}
};

/**
 * คำนวณ Status ร้านแบบ Real-time (Revised Logic V2)
 */
export const calculateShopStatus = (shop, nowObj) => {
	const manualStatus = shop.originalStatus?.toUpperCase()?.trim() || "";

	// 1. MANUAL OVERRIDE (เชื่อ Sheet ก่อนเสมอ)
	// 'LIVE' = มี Event (เรืองแสง) -> ต้องระบุใน CSV เท่านั้น
	if (manualStatus === "LIVE") return "LIVE";

	// 'ACTIVE' = เปิดปกติ (ไม่เรืองแสง) -> ระบุ Manual ได้
	if (manualStatus === "ACTIVE") return "ACTIVE";

	if (manualStatus && manualStatus !== "AUTO") {
		if (
			["OFF", "CLOSED", "CLOSE", "TEMP CLOSED", "MAINTENANCE"].includes(
				manualStatus,
			)
		)
			return "OFF";
		if (["FORCE OPEN", "ALWAYS OPEN"].includes(manualStatus)) return "ACTIVE";
		if (["TONIGHT"].includes(manualStatus)) return "TONIGHT";
	}

	// 2. TIME CALCULATION (AUTO)
	if (shop.openTime && shop.closeTime) {
		// Check 1: ร้านเปิดอยู่มั้ย?
		const isOpen = isTimeInRange(shop.openTime, shop.closeTime, nowObj);
		if (isOpen) return "ACTIVE"; // ✅ เปลี่ยนจาก LIVE เป็น ACTIVE (เปิดปกติ ไม่เรืองแสง)

		// Check 2: TONIGHT Logic (06:00 -> เวลาเปิด)
		const currentMinutes = nowObj.getHours() * 60 + nowObj.getMinutes();
		const openMinutes = parseToMinutes(shop.openTime);
		const openHour = openMinutes / 60; // ชั่วโมงที่เปิด (เช่น 18.0)

		// "ร้านกลางคืน" (Night Shop) เรานิยามว่าเปิดหลัง 17:00 (5 โมงเย็น)
		const isNightShop = openHour >= 17 || openHour <= 4; // เปิดเย็น หรือเปิดดึกดื่น

		// ถ้าตอนนี้เป็นเวลา 06:00 เป็นต้นไป AND ยังไม่ถึงเวลาเปิด AND เป็นร้านกลางคืน
		// ตัวอย่าง: ตอนนี้ 10:00, ร้านเปิด 19:00 -> เข้าเงื่อนไข TONIGHT
		if (currentMinutes >= 360 && currentMinutes < openMinutes && isNightShop) {
			return "TONIGHT";
		}

		// นอกนั้น (เช่น ตี 4 - 6 โมงเช้า) ให้เป็น OFF
		return "OFF";
	}

	return "OFF";
};

/**
 * ตรวจสอบ Golden Time
 */
export const isGoldenTime = (shop, nowObj) => {
	return isTimeInRange(shop.goldenStart, shop.goldenEnd, nowObj);
};

// --- Existing Logic ---

export const isFlashActive = (shop) => {
	if (!shop.promotionEndtime || !shop.promotionInfo) return false;

	const now = new Date();
	const [hours, minutes] = shop.promotionEndtime.split(":");

	const target = new Date();
	target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

	const diff = target - now;
	const maxFlashWindow = 1200000;

	return diff > 0 && diff <= maxFlashWindow;
};

export const getStatusColorClass = (status) => {
	const s = status?.toUpperCase();
	if (s === "LIVE") return "bg-red-600";
	if (s === "TONIGHT") return "bg-orange-600";
	return "bg-zinc-700";
};

export const getStatusBoxClass = (status) => {
	const s = status?.toUpperCase();
	if (s === "LIVE") return "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]";
	if (s === "TONIGHT")
		return "bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.5)]";
	return "bg-zinc-700";
};

export const getPinIconUrl = (status) => {
	const s = status?.toUpperCase();
	if (s === "LIVE") return "/images/pins/pin-red.svg";
	if (s === "TONIGHT") return "/images/pins/pin-orange.svg";
	return "/images/pins/pin-gray.svg";
};

export const getShopPriority = (shop) => {
	if (isFlashActive(shop)) return 0;
	if (shop.isGolden) return 1;
	if (shop.status === "LIVE") return 2;
	if (shop.status === "TONIGHT") return 3;
	return 4;
};
