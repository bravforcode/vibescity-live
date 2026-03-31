/**
 * src/utils/browserUtils.js
 * รวมฟังก์ชันจัดการ Browser Actions, External Links และ Clipboard
 * เวอร์ชันปรับปรุงสำหรับมือถือ
 */

// คัดลอกข้อความลงคลิปบอร์ด (รองรับทั้ง Desktop และ Mobile)
export const copyToClipboard = async (text) => {
	try {
		// วิธีที่ 1: ใช้ Clipboard API (Modern Browsers)
		// เพิ่มการดัก Error ในกรณีที่ใช้ API ไม่ได้
		if (navigator.clipboard && window.isSecureContext) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch (e) {
				console.warn("Clipboard API failed, using fallback", e);
			}
		}

		// วิธีที่ 2: Fallback สำหรับเบราว์เซอร์เก่า / มือถือบางรุ่น
		const textArea = document.createElement("textarea");
		textArea.value = text;

		// ป้องกัน Keyboard เด้ง (สำคัญมาก)
		textArea.setAttribute("readonly", "");
		textArea.style.contain = "strict";

		// เอา textarea ออกจาก viewport แบบไม่ให้ส่งผลต่อ Layout
		textArea.style.position = "fixed";
		textArea.style.left = "-9999px";
		textArea.style.fontSize = "12pt"; // ป้องกัน Zoom บน iOS

		document.body.appendChild(textArea);

		// เลือกข้อความ
		const range = document.createRange();
		range.selectNodeContents(textArea);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);

		textArea.setSelectionRange(0, 999999); // สำหรับมือถือ

		// คัดลอก
		const success = document.execCommand("copy");

		// Cleanup
		textArea.remove();
		selection.removeAllRanges();

		return success;
	} catch (err) {
		console.error("Copy failed:", err);
		return false;
	}
};

/**
 * Open Google Maps for directions to the specified coordinates.
 * @param {number} lat - Destination latitude
 * @param {number} lng - Destination longitude
 * @returns {boolean} - Whether the operation was successful
 */
export const openGoogleMapsDir = (lat, lng, originArg = null) => {
	const latNum = Number(lat);
	const lngNum = Number(lng);
	if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
		console.error("Invalid coordinates:", lat, lng);
		return false;
	}
	// สร้าง URL สำหรับอุปกรณ์ต่างๆ
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
	const isAndroid = /android/i.test(userAgent);

	// Encode ชื่อปลายทาง
	const destination = encodeURIComponent(`${latNum},${lngNum}`);
	const parseOrigin = (value) => {
		if (Array.isArray(value) && value.length >= 2) {
			const oLat = Number(value[0]);
			const oLng = Number(value[1]);
			if (Number.isFinite(oLat) && Number.isFinite(oLng)) {
				return { lat: oLat, lng: oLng };
			}
			return null;
		}
		if (value && typeof value === "object") {
			const oLat = Number(value.lat ?? value.latitude);
			const oLng = Number(value.lng ?? value.longitude ?? value.lon);
			if (Number.isFinite(oLat) && Number.isFinite(oLng)) {
				return { lat: oLat, lng: oLng };
			}
		}
		return null;
	};
	const origin = parseOrigin(originArg);
	const originParam = origin
		? `&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}`
		: "";
	const webUrl = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destination}&travelmode=driving`;

	try {
		if (isIOS) {
			// สำหรับ iOS - พยายามเปิดแอพ Google Maps
			const iosSource = origin
				? encodeURIComponent(`${origin.lat},${origin.lng}`)
				: "Current+Location";
			const iosUrl = `maps://maps.google.com/maps?saddr=${iosSource}&daddr=${destination}&directionsmode=driving`;
			window.location.href = iosUrl;

			// Fallback หลังจาก 500ms
			setTimeout(() => {
				if (document.visibilityState === "visible") {
					openExternal(webUrl);
				}
			}, 500);
		} else if (isAndroid) {
			// สำหรับ Android
			const androidUrl = `google.navigation:q=${destination}&mode=d`;
			window.location.href = androidUrl;

			// Fallback หลังจาก 500ms
			setTimeout(() => {
				if (document.visibilityState === "visible") {
					openExternal(webUrl);
				}
			}, 500);
		} else {
			// สำหรับ Desktop/Browser อื่นๆ
			openExternal(webUrl);
		}

		return true;
	} catch (error) {
		console.error("Failed to open Google Maps:", error);
		// Fallback มาตรฐาน
		openExternal(webUrl);
		return false;
	}
};

// เปิดลิงก์ภายนอกแบบปลอดภัย
export const openExternal = (url, features = "") => {
	const finalFeatures = ["noopener", "noreferrer", features]
		.filter(Boolean)
		.join(",");
	const win = window.open(url, "_blank", finalFeatures);
	if (win) win.opener = null;
	return Boolean(win);
};

// ฟังก์ชันเช็คว่าอยู่บนมือถือหรือไม่
export const isMobileDevice = () => {
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	return /android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent);
};

// ฟังก์ชันแชร์ตำแหน่ง
export const shareLocation = async (
	shopOrName,
	latOrOrigin = null,
	lngArg = null,
	originArg = null,
) => {
	const toCoord = (lat, lng) => {
		const latNum = Number(lat);
		const lngNum = Number(lng);
		if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
		return { lat: latNum, lng: lngNum };
	};
	const parseOrigin = (value) => {
		if (Array.isArray(value) && value.length >= 2) {
			return toCoord(value[0], value[1]);
		}
		if (value && typeof value === "object") {
			return toCoord(value.lat ?? value.latitude, value.lng ?? value.longitude);
		}
		return null;
	};

	let destination = null;
	let name = "";
	let origin = null;

	if (shopOrName && typeof shopOrName === "object") {
		name = String(shopOrName.name || shopOrName.Name || "VibeCity Place");
		destination = toCoord(
			shopOrName.lat ?? shopOrName.latitude,
			shopOrName.lng ?? shopOrName.longitude,
		);
		origin = parseOrigin(latOrOrigin);
	} else {
		name = String(shopOrName || "VibeCity Place");
		destination = toCoord(latOrOrigin, lngArg);
		origin = parseOrigin(originArg);
	}

	if (!destination) return false;

	const destinationText = `${destination.lat},${destination.lng}`;
	const originPart = origin
		? `&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}`
		: "";
	const shareUrl = `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encodeURIComponent(destinationText)}&travelmode=driving`;
	const textLines = [`ไปร้าน ${name} กัน!`, `ตำแหน่งร้าน: ${destinationText}`];
	if (origin) {
		textLines.push(`เริ่มจากตำแหน่งผู้ใช้: ${origin.lat},${origin.lng}`);
	}

	if (navigator.share) {
		try {
			await navigator.share({
				title: name,
				text: textLines.join("\n"),
				url: shareUrl,
			});
			return true;
		} catch (error) {
			if (error?.name !== "AbortError") {
				console.error("Share failed:", error);
			}
		}
	}

	return copyToClipboard(shareUrl);
};
