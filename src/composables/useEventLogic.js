import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { getAllEvents } from "../services/eventService";
import { useShopStore } from "../store/shopStore";

export function useEventLogic() {
	const shopStore = useShopStore();
	const { currentTime } = storeToRefs(shopStore);

	const realTimeEvents = ref([]); // ✅ Real-time events from API
	const timedEvents = ref([]); // ✅ Dynamic events from events.json
	const buildingsData = ref({}); // ✅ Building metadata

	// ✅ MOCK EVENTS DATA (To be replaced by API later)
	const mockEvents = {
		oneNimman: {
			id: "event-onenimman-01",
			buildingId: "oneNimman",
			name: "Chiang Mai Food Festival 2024",
			shortName: "Food Fest",
			image:
				"https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=1000&auto=format&fit=crop",
			video: "https://www.w3schools.com/html/mov_bbb.mp4", // Placeholder
			description:
				"ที่สุดของมหกรรมอาหารเหนือและสตรีทฟู้ดร้านดังกว่า 50 ร้าน พร้อมดนตรีสดตลอดคืน!",
			startTime: "2024-01-01T10:00:00", // Long running for demo
			endTime: "2030-12-31T22:00:00",
			status: "LIVE",
			highlights: [
				{
					type: "image",
					src: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1",
				},
				{
					type: "image",
					src: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38",
				},
			],
			zones: [
				{
					title: "Street Food Zone",
					description: "รวมร้านเด็ดเชียงใหม่",
					image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
				},
				{
					title: "Craft Beer Garden",
					description: "เบียร์คราฟต์ไทย",
					image: "https://images.unsplash.com/photo-1575037614876-c38a4d44f5b8",
				},
			],
			timeline: [
				{ time: "17:00", activity: "Opening Ceremony" },
				{ time: "18:30", activity: "Live Band: The Yers" },
				{ time: "20:00", activity: "DJ Stage" },
			],
		},
		maya: {
			id: "event-maya-01",
			buildingId: "maya",
			name: "MAYA Rooftop Cinema",
			shortName: "Rooftop Cinema",
			image:
				"https://images.unsplash.com/photo-1517604931442-710c8ef5ad25?q=80&w=1000",
			description: "ดูหนังกลางแปลงบนดาดฟ้า บรรยากาศสุดชิล",
			startTime: "2024-01-01T18:00:00",
			endTime: "2025-12-31T23:00:00",
			status: "UPCOMING",
		},
	};

	/**
	 * Fetches real-time events from the API and local sources.
	 */
	const updateEventsData = async () => {
		try {
			const events = await getAllEvents();
			realTimeEvents.value = events;
		} catch (err) {
			console.warn("Real-time events sync failed:", err.message);
		}
	};

	// ✅ Computed: Active Events
	// Returns buildings object but decorated with event data IF event is active
	const activeEvents = computed(() => {
		const result = [];
		if (!buildingsData.value) return [];

		const now = currentTime.value;

		// 1. Process mockEvents (Fixed buildings with events)
		Object.keys(mockEvents).forEach((key) => {
			const building = buildingsData.value[key];
			const event = mockEvents[key];
			if (building && event) {
				const start = new Date(event.startTime);
				const end = new Date(event.endTime);
				if (now >= start && now <= end) {
					result.push({
						...building,
						...event,
						key: key,
						isEvent: true,
					});
				}
			}
		});

		// 2. Process timedEvents (from events.json)
		if (Array.isArray(timedEvents.value)) {
			timedEvents.value.forEach((event) => {
				const start = new Date(event.startTime || event.date);
				const end = new Date(
					event.endTime || new Date(new Date(event.date).getTime() + 86400000),
				);
				if (now >= start && now <= end) {
					result.push({
						...event,
						key: event.id,
						isEvent: true,
					});
				}
			});
		}

		// 3. Process realTimeEvents (from API)
		if (Array.isArray(realTimeEvents.value)) {
			realTimeEvents.value.forEach((event) => {
				const start = new Date(event.startTime);
				const end = new Date(event.endTime);
				if (now >= start && now <= end) {
					result.push({
						...event,
						key: event.id,
						isEvent: true,
					});
				}
			});
		}

		return result;
	});

	return {
		realTimeEvents,
		timedEvents,
		buildingsData,
		mockEvents,
		updateEventsData,
		activeEvents,
	};
}
