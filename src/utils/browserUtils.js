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
export const openGoogleMapsDir = (lat, lng) => {
	if (!lat || !lng) {
		console.error("Invalid coordinates:", lat, lng);
		return false;
	}

	// สร้าง URL สำหรับอุปกรณ์ต่างๆ
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
	const isAndroid = /android/i.test(userAgent);

	// Encode ชื่อปลายทาง
	const destination = encodeURIComponent(`${lat},${lng}`);

	try {
		if (isIOS) {
			// สำหรับ iOS - พยายามเปิดแอพ Google Maps
			const iosUrl = `maps://maps.google.com/maps?daddr=${destination}&directionsmode=driving`;
			window.location.href = iosUrl;

			// Fallback หลังจาก 500ms
			setTimeout(() => {
				if (document.visibilityState === "visible") {
					openExternal(`https://maps.apple.com/?daddr=${destination}`);
				}
			}, 500);
		} else if (isAndroid) {
			// สำหรับ Android
			const androidUrl = `google.navigation:q=${destination}&mode=d`;
			window.location.href = androidUrl;

			// Fallback หลังจาก 500ms
			setTimeout(() => {
				if (document.visibilityState === "visible") {
					openExternal(
						`https://www.google.com/maps/dir/?api=1&destination=${destination}`,
					);
				}
			}, 500);
		} else {
			// สำหรับ Desktop/Browser อื่นๆ
			openExternal(
				`https://www.google.com/maps/dir/?api=1&destination=${destination}`,
			);
		}

		return true;
	} catch (error) {
		console.error("Failed to open Google Maps:", error);
		// Fallback มาตรฐาน
		openExternal(
			`https://www.google.com/maps/dir/?api=1&destination=${destination}`,
		);
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
	return (
		/android/i.test(userAgent) ||
		/iPad|iPhone|iPod/.test(userAgent) ||
		(window.innerWidth <= 768 && window.innerHeight <= 1024)
	);
};

// ฟังก์ชันแชร์ตำแหน่ง
export const shareLocation = (shop) => {
	if (navigator.share && isMobileDevice()) {
		const shareData = {
			title: shop.name,
			text: `ไปร้าน ${shop.name} กัน!\nตำแหน่ง: https://maps.google.com/?q=${shop.lat},${shop.lng}`,
			url: window.location.href,
		};

		return navigator.share(shareData).catch(console.error);
	} else {
		// Fallback สำหรับ Desktop หรือเบราว์เซอร์ที่ไม่รองรับ
		const shareUrl = `https://maps.google.com/?q=${shop.lat},${shop.lng}`;
		copyToClipboard(shareUrl);
		return true;
	}
};
