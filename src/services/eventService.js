/**
 * VibeCity Event Service
 * ดึงข้อมูล Events แบบ Real-time จากหลายแหล่ง
 *
 * Sources:
 * - Ticketmelon API
 * - ThaiTicketMajor
 * - Facebook Events (via Graph API)
 * - Eventbrite
 */
import { isTransientNetworkError } from "../utils/networkErrorUtils";
import {
	computeBackoffDelayMs,
	shouldRetryResource,
	waitForBackoff,
} from "../utils/retryPolicy";

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
let eventCache = {
	data: [],
	lastFetched: null,
};

const warnEventProviderFailure = (provider, error) => {
	if (!import.meta.env.DEV || isTransientNetworkError(error)) return;
	console.warn(
		`[EventService] ${provider} source failed, using fallback`,
		error,
	);
};

const withEventProviderFallback = async (provider, run) => {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			if (
				isTransientNetworkError(error) &&
				shouldRetryResource({ resourceType: "events", attempt })
			) {
				await waitForBackoff(
					computeBackoffDelayMs({ resourceType: "events", attempt }),
				);
				continue;
			}
			warnEventProviderFailure(provider, error);
			return [];
		}
	}
};

/**
 * Event categories mapping
 */
const EVENT_CATEGORIES = {
	concert: { icon: "🎵", color: "#9B59B6", label: "คอนเสิร์ต" },
	festival: { icon: "🎉", color: "#E74C3C", label: "เทศกาล" },
	sports: { icon: "⚽", color: "#27AE60", label: "กีฬา" },
	exhibition: { icon: "🎨", color: "#3498DB", label: "นิทรรศการ" },
	market: { icon: "🛍️", color: "#F39C12", label: "ตลาด" },
	workshop: { icon: "📚", color: "#8B4513", label: "Workshop" },
	nightlife: { icon: "🍸", color: "#9B59B6", label: "ไนท์ไลฟ์" },
	food: { icon: "🍜", color: "#E74C3C", label: "อาหาร" },
	temple: { icon: "🛕", color: "#F39C12", label: "งานวัด" },
	other: { icon: "📅", color: "#95A5A6", label: "อื่นๆ" },
};

/**
 * Thai Holidays & Major Events 2024-2026
 * เพิ่ม recurring events ที่เกิดขึ้นทุกปี
 */
const RECURRING_EVENTS = [
	// มกราคม
	{
		name: "วันขึ้นปีใหม่",
		month: 1,
		day: 1,
		category: "festival",
		province: "ทั่วประเทศ",
	},
	{
		name: "ตรุษจีน",
		month: 1,
		day: 29,
		category: "festival",
		province: "กรุงเทพฯ",
		zone: "เยาวราช",
	},

	// กุมภาพันธ์
	{
		name: "วันมาฆบูชา",
		month: 2,
		day: 12,
		category: "temple",
		province: "ทั่วประเทศ",
	},
	{
		name: "วันวาเลนไทน์",
		month: 2,
		day: 14,
		category: "festival",
		province: "ทั่วประเทศ",
	},
	{
		name: "เทศกาลดอกไม้เชียงใหม่",
		month: 2,
		day: 1,
		duration: 3,
		category: "festival",
		province: "เชียงใหม่",
	},

	// มีนาคม-เมษายน
	{
		name: "สงกรานต์",
		month: 4,
		day: 13,
		duration: 3,
		category: "festival",
		province: "ทั่วประเทศ",
	},
	{
		name: "สงกรานต์ถนนข้าวสาร",
		month: 4,
		day: 13,
		duration: 3,
		category: "festival",
		province: "กรุงเทพฯ",
		zone: "บางลำพู",
	},
	{
		name: "สงกรานต์สีลม",
		month: 4,
		day: 13,
		duration: 3,
		category: "festival",
		province: "กรุงเทพฯ",
		zone: "สีลม",
	},
	{
		name: "สงกรานต์เชียงใหม่",
		month: 4,
		day: 13,
		duration: 5,
		category: "festival",
		province: "เชียงใหม่",
	},
	{
		name: "สงกรานต์พัทยา",
		month: 4,
		day: 13,
		duration: 5,
		category: "festival",
		province: "ชลบุรี",
		zone: "พัทยา",
	},

	// พฤษภาคม
	{
		name: "วันวิสาขบูชา",
		month: 5,
		day: 22,
		category: "temple",
		province: "ทั่วประเทศ",
	},
	{
		name: "พืชมงคล",
		month: 5,
		day: 10,
		category: "festival",
		province: "กรุงเทพฯ",
	},

	// กรกฎาคม
	{
		name: "วันอาสาฬหบูชา",
		month: 7,
		day: 20,
		category: "temple",
		province: "ทั่วประเทศ",
	},
	{
		name: "วันเข้าพรรษา",
		month: 7,
		day: 21,
		category: "temple",
		province: "ทั่วประเทศ",
	},
	{
		name: "แห่เทียนพรรษาอุบล",
		month: 7,
		day: 20,
		duration: 3,
		category: "festival",
		province: "อุบลราชธานี",
	},
	{
		name: "บุญบั้งไฟยโสธร",
		month: 5,
		day: 10,
		duration: 3,
		category: "festival",
		province: "ยโสธร",
	},

	// สิงหาคม
	{
		name: "วันแม่แห่งชาติ",
		month: 8,
		day: 12,
		category: "festival",
		province: "ทั่วประเทศ",
	},

	// ตุลาคม
	{
		name: "ออกพรรษา",
		month: 10,
		day: 17,
		category: "temple",
		province: "ทั่วประเทศ",
	},
	{
		name: "บั้งไฟพญานาค",
		month: 10,
		day: 17,
		category: "festival",
		province: "หนองคาย",
	},
	{
		name: "ลอยกระทง",
		month: 11,
		day: 15,
		category: "festival",
		province: "ทั่วประเทศ",
	},
	{
		name: "ลอยกระทงสุโขทัย",
		month: 11,
		day: 15,
		duration: 5,
		category: "festival",
		province: "สุโขทัย",
	},
	{
		name: "ยี่เป็งเชียงใหม่",
		month: 11,
		day: 15,
		duration: 3,
		category: "festival",
		province: "เชียงใหม่",
	},

	// พฤศจิกายน-ธันวาคม
	{
		name: "Full Moon Party",
		month: null,
		recurring: "monthly",
		category: "nightlife",
		province: "สุราษฎร์ธานี",
		zone: "เกาะพะงัน",
	},
	{
		name: "Wonderfruit Festival",
		month: 12,
		day: 12,
		duration: 4,
		category: "festival",
		province: "ชลบุรี",
		zone: "พัทยา",
	},
	{
		name: "Countdown Central World",
		month: 12,
		day: 31,
		category: "concert",
		province: "กรุงเทพฯ",
		zone: "ราชประสงค์",
	},
	{
		name: "Countdown ICONSIAM",
		month: 12,
		day: 31,
		category: "concert",
		province: "กรุงเทพฯ",
		zone: "คลองสาน",
	},
	{
		name: "Countdown Pattaya",
		month: 12,
		day: 31,
		category: "concert",
		province: "ชลบุรี",
		zone: "พัทยา",
	},
	{
		name: "Countdown Chiang Mai",
		month: 12,
		day: 31,
		category: "concert",
		province: "เชียงใหม่",
	},
];

/**
 * Generate upcoming events based on recurring events
 */
function generateUpcomingEvents(daysAhead = 90) {
	const events = [];
	const today = new Date();
	const endDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

	RECURRING_EVENTS.forEach((event) => {
		if (event.recurring === "monthly") {
			// Full Moon Party - find next full moons
			let checkDate = new Date(today);
			while (checkDate <= endDate) {
				const fullMoon = getNextFullMoon(checkDate);
				if (fullMoon <= endDate) {
					events.push({
						...event,
						id: `${event.name.replace(/\s/g, "-")}-${fullMoon.toISOString().split("T")[0]}`,
						startDate: fullMoon,
						endDate: fullMoon,
						...EVENT_CATEGORIES[event.category],
					});
				}
				checkDate = new Date(fullMoon.getTime() + 30 * 24 * 60 * 60 * 1000);
			}
		} else if (event.month) {
			// Fixed date events
			const currentYear = today.getFullYear();
			[currentYear, currentYear + 1].forEach((year) => {
				const eventDate = new Date(year, event.month - 1, event.day);
				if (eventDate >= today && eventDate <= endDate) {
					const duration = event.duration || 1;
					events.push({
						...event,
						id: `${event.name.replace(/\s/g, "-")}-${year}`,
						startDate: eventDate,
						endDate: new Date(
							eventDate.getTime() + (duration - 1) * 24 * 60 * 60 * 1000,
						),
						...EVENT_CATEGORIES[event.category],
					});
				}
			});
		}
	});

	return events.sort((a, b) => a.startDate - b.startDate);
}

/**
 * Approximate full moon calculation
 */
function getNextFullMoon(fromDate) {
	// Lunar cycle is ~29.53 days
	// Known full moon: Jan 25, 2024
	const knownFullMoon = new Date(2024, 0, 25);
	const lunarCycle = 29.53 * 24 * 60 * 60 * 1000;

	let fullMoon = new Date(knownFullMoon);
	while (fullMoon < fromDate) {
		fullMoon = new Date(fullMoon.getTime() + lunarCycle);
	}
	return fullMoon;
}

/**
 * Fetch events from Ticketmelon (Thailand's major ticketing platform)
 */
async function fetchTicketmelonEvents() {
	return withEventProviderFallback("Ticketmelon", async () => {
		// Note: This would need actual API access
		// For now, return mock data structure
		// In production, use:
		// const response = await fetch('https://www.ticketmelon.com/api/events');
		// return await response.json();

		return [];
	});
}

/**
 * Fetch events from Facebook Graph API
 */
async function fetchFacebookEvents(accessToken, _locationIds = []) {
	return withEventProviderFallback("Facebook", async () => {
		if (!accessToken) {
			return [];
		}

		// In production:
		// const response = await fetch(
		//   `https://graph.facebook.com/v18.0/search?type=event&center=13.7563,100.5018&distance=50000&access_token=${accessToken}`
		// );

		return [];
	});
}

/**
 * Scrape ThaiTicketMajor for upcoming concerts
 */
async function fetchThaiTicketMajorEvents() {
	return withEventProviderFallback("ThaiTicketMajor", async () => {
		// This would need web scraping or API access
		// For demonstration, return sample upcoming concerts

		return [
			{
				id: "ttm-concert-1",
				name: "Bodyslam Live in Bangkok",
				category: "concert",
				venue: "Impact Arena",
				province: "นนทบุรี",
				startDate: getNextWeekend(),
				ticketUrl: "https://www.thaiticketmajor.com",
				...EVENT_CATEGORIES.concert,
			},
		];
	});
}

function getNextWeekend() {
	const today = new Date();
	const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
	return new Date(today.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
}

/**
 * Main function to get all events
 */
export async function getAllEvents(options = {}) {
	const {
		forceRefresh = false,
		province = null,
		category = null,
		daysAhead = 90,
	} = options;

	// Check cache
	if (
		!forceRefresh &&
		eventCache.lastFetched &&
		Date.now() - eventCache.lastFetched < CACHE_DURATION
	) {
		return filterEvents(eventCache.data, province, category);
	}

	// Fetch from all sources
	const [recurringEvents, ticketmelonEvents, thaiTicketMajorEvents] =
		await Promise.all([
			Promise.resolve(generateUpcomingEvents(daysAhead)),
			fetchTicketmelonEvents(),
			fetchThaiTicketMajorEvents(),
		]);

	// Combine and deduplicate
	const allEvents = [
		...recurringEvents,
		...ticketmelonEvents,
		...thaiTicketMajorEvents,
	];

	// Update cache
	eventCache = {
		data: allEvents,
		lastFetched: Date.now(),
	};

	return filterEvents(allEvents, province, category);
}

function filterEvents(events, province, category) {
	let filtered = events;

	if (province && province !== "ทั่วประเทศ") {
		filtered = filtered.filter(
			(e) => e.province === province || e.province === "ทั่วประเทศ",
		);
	}

	if (category) {
		filtered = filtered.filter((e) => e.category === category);
	}

	return filtered;
}

/**
 * Get events for a specific province
 */
export async function getEventsByProvince(province) {
	return getAllEvents({ province });
}

/**
 * Get events happening today
 */
export async function getTodaysEvents() {
	const events = await getAllEvents();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	return events.filter((e) => {
		const start = new Date(e.startDate);
		const end = new Date(e.endDate);
		return start <= tomorrow && end >= today;
	});
}

/**
 * Get events happening this week
 */
export async function getThisWeeksEvents() {
	const events = await getAllEvents();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const nextWeek = new Date(today);
	nextWeek.setDate(nextWeek.getDate() + 7);

	return events.filter((e) => {
		const start = new Date(e.startDate);
		return start >= today && start <= nextWeek;
	});
}

/**
 * Format event for display
 */
export function formatEventForDisplay(event) {
	const startDate = new Date(event.startDate);
	const now = Date.now();
	const today = new Date();
	const diffDays = (startDate.getTime() - now) / (1000 * 60 * 60 * 24);
	const options = {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	};

	return {
		...event,
		displayDate: startDate.toLocaleDateString("th-TH", options),
		daysUntil: Math.ceil(diffDays),
		isToday: startDate.toDateString() === today.toDateString(),
		isThisWeek: Math.ceil(diffDays) <= 7,
	};
}

export { EVENT_CATEGORIES, RECURRING_EVENTS };
