/**
 * ฟังก์ชันจัดการสื่อ (วิดีโอ/รูปภาพ) จาก URL ต่างๆ
 */
export const getMediaDetails = (url) => {
	if (!url || typeof url !== "string") return { type: "none", url: "" };

	const trimmedUrl = url.trim();

	// 1. ฟังก์ชันช่วยแกะ File ID จาก Google Drive
	const getDriveId = (u) => {
		if (!u.includes("drive.google.com")) return null;
		const parts = u.split("/d/");
		if (parts.length > 1) return parts[1].split("/")[0];
		const idParam = u.split("id=")[1];
		return idParam ? idParam.split("&")[0] : null;
	};

	const driveId = getDriveId(trimmedUrl);

	// 2. จัดการ YouTube (Ultra Autoplay Logic)
	if (trimmedUrl.includes("youtube.com") || trimmedUrl.includes("youtu.be")) {
		let videoId = "";
		if (trimmedUrl.includes("v=")) {
			videoId = trimmedUrl.split("v=")[1]?.split("&")[0];
		} else if (trimmedUrl.includes("youtu.be/")) {
			videoId = trimmedUrl.split("youtu.be/")[1]?.split("?")[0];
		}

		/**
		 * - rel=0: ไม่โชว์วิดีโอแนะนำตอนจบ
		 * - iv_load_policy=3: ปิด Annotation ที่ชอบเด้งมาบัง
		 * - widget_referrer: ระบุแหล่งที่มาช่วยให้ข้ามการบล็อกบางอย่างได้
		 * - mute=1 & autoplay=1: สูตรมาตรฐานที่ต้องมาคู่กัน
		 */
		const params = [
			`autoplay=1`,
			`mute=0`,
			`loop=1`,
			`playlist=${videoId}`,
			`controls=0`,
			`playsinline=1`,
			`rel=0`,
			`enablejsapi=1`,
			`iv_load_policy=3`,
			`origin=${window.location.origin}`,
		].join("&");

		return {
			type: "youtube",
			url: `https://www.youtube.com/embed/${videoId}?${params}`,
		};
	}

	// 3. จัดการ Google Drive
	if (driveId) {
		const isVideoHint = trimmedUrl.toLowerCase().includes("video");
		return {
			type: isVideoHint ? "video" : "image",
			url: `https://docs.google.com/uc?export=view&id=${driveId}`,
		};
	}

	// 4. จัดการไฟล์ตรงๆ
	const isImage = /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(trimmedUrl);
	return {
		type: isImage ? "image" : "video",
		url: trimmedUrl,
	};
};
