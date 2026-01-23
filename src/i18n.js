import { createI18n } from "vue-i18n";

const messages = {
	th: {
		nav: {
			search: "ค้นหาบรรยากาศ, งาน, ร้านค้า...",
			level: "ระดับ {lvl}",
			xp: "XP: {current}/{next}",
			all_categories: "🎯 ทุกประเภท",
			vibes_now: "กำลังฮิตขณะนี้",
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
			bar_desc: "🍸 บาร์ลับใจกลางเชียงใหม่ พร้อมเครื่องดื่มคราฟต์และดนตรีสุดคลาสสิก",
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
			search: "ค้นหาร้านในห้าง...",
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
		},
		legend: {
			title: "สัญลักษณ์ในแผนที่",
			live_now: "มีกิจกรรมขณะนี้",
			coin_reward: "รางวัลเหรียญ",
			selected: "สถานที่ที่เลือก",
		},
		reviews: {
			title: "ความเห็นจากคอมมูนิตี้",
			count: "รีวิว",
			placeholder: "ร่วมแชร์บรรยากาศที่นี่...",
			submit: "โพสต์รีวิว",
			success_title: "บันทึกสำเร็จ!",
			success_msg: "ขอบคุณที่ช่วยแชร์บรรยากาศให้เพื่อนๆ!",
			verified: "ยืนยันตัวตนแล้ว",
		},
	},
	en: {
		nav: {
			search: "Search vibes, events, shops...",
			level: "Level {lvl}",
			xp: "XP: {current}/{next}",
			all_categories: "🎯 All Categories",
			vibes_now: "Vibes Now",
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
				"🍸 Hidden bar in the heart of Chiang Mai with craft drinks and classic music.",
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
			search: "Search shops in mall...",
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
		},
		legend: {
			title: "Map Legend",
			live_now: "LIVE NOW",
			coin_reward: "COIN REWARD",
			selected: "SELECTED",
		},
		reviews: {
			title: "Community Vibes",
			count: "REVIEWS",
			placeholder: "Share the vibe...",
			submit: "POST REVIEW",
			success_title: "Vibe Logged!",
			success_msg: "Your contribution helps others find the best spots.",
			verified: "Verified",
		},
	},
};

// ✅ Locale persistence (จำภาษาที่เลือกไว้)
const DEFAULT_LOCALE = "th";
const savedLocale = localStorage.getItem("locale");
const locale = savedLocale || DEFAULT_LOCALE;

const i18n = createI18n({
	legacy: false, // Composition API
	globalInjection: true, // (optional) ให้ใช้ $t ได้ใน template แบบง่ายขึ้น
	locale,
	fallbackLocale: "en",
	messages,
	// ✅ ถ้าหา key ไม่เจอ จะ warn ใน console เฉพาะ dev
	missingWarn: import.meta.env.DEV,
	fallbackWarn: import.meta.env.DEV,
});

export default i18n;
