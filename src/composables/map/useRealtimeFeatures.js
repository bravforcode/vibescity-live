/**
 * useRealtimeFeatures - Real-time Map Features
 *
 * Features:
 * - Live traffic updates
 * - Real-time venue status
 * - Live event tracking
 * - Crowd density monitoring
 * - Dynamic hotspot detection
 * - WebSocket integration
 * - Optimistic updates
 */

import { computed, getCurrentInstance, onUnmounted, ref, watch } from "vue";

const UPDATE_INTERVALS = {
	traffic: 30000, // 30 seconds
	venues: 60000, // 1 minute
	events: 120000, // 2 minutes
	crowdDensity: 45000, // 45 seconds
	hotspots: 90000, // 1.5 minutes
};

export function useRealtimeFeatures(_map, options = {}) {
	const trafficData = ref([]);
	const venueStatuses = ref(new Map());
	const liveEvents = ref([]);
	const crowdDensity = ref(new Map());
	const hotspots = ref([]);
	const isConnected = ref(false);
	const lastUpdate = ref({});
	const logger = options.logger ?? console;
	const logDebug = (...args) => {
		if (options.debug === true) {
			logger.log?.(...args);
		}
	};
	const logError = (...args) => {
		logger.error?.(...args);
	};

	let ws = null;
	let updateIntervals = {};
	let reconnectTimeout = null;
	let reconnectAttempts = 0;
	let isShuttingDown = false;
	const MAX_RECONNECT_ATTEMPTS = 5;

	// WebSocket connection
	const connectWebSocket = () => {
		if (!options.wsUrl) return;

		try {
			ws = new WebSocket(options.wsUrl);

			ws.onopen = () => {
				logDebug("[Realtime] WebSocket connected");
				isConnected.value = true;
				reconnectAttempts = 0;

				// Subscribe to channels
				ws.send(
					JSON.stringify({
						type: "subscribe",
						channels: ["traffic", "venues", "events", "crowd", "hotspots"],
					}),
				);
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					handleRealtimeUpdate(data);
				} catch (error) {
					logError("[Realtime] Parse error:", error);
				}
			};

			ws.onerror = (error) => {
				logError("[Realtime] WebSocket error:", error);
			};

			ws.onclose = () => {
				logDebug("[Realtime] WebSocket disconnected");
				isConnected.value = false;
				if (isShuttingDown) return;
				attemptReconnect();
			};
		} catch (error) {
			logError("[Realtime] Connection error:", error);
			attemptReconnect();
		}
	};

	// Reconnect logic
	const attemptReconnect = () => {
		if (isShuttingDown) return;
		if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			logError("[Realtime] Max reconnect attempts reached");
			return;
		}

		const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
		reconnectAttempts++;

		logDebug(
			`[Realtime] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
		);

		reconnectTimeout = setTimeout(() => {
			connectWebSocket();
		}, delay);
	};

	// Handle real-time updates
	const handleRealtimeUpdate = (data) => {
		const { type, payload, timestamp } = data;

		lastUpdate.value[type] = timestamp || Date.now();

		switch (type) {
			case "traffic":
				updateTrafficData(payload);
				break;
			case "venue_status":
				updateVenueStatus(payload);
				break;
			case "event":
				updateLiveEvents(payload);
				break;
			case "crowd_density":
				updateCrowdDensity(payload);
				break;
			case "hotspot":
				updateHotspots(payload);
				break;
		}
	};

	// Update traffic data
	const updateTrafficData = (data) => {
		if (!Array.isArray(data)) return;

		trafficData.value = data.map((segment) => ({
			id: segment.id,
			coordinates: segment.coordinates,
			speed: segment.speed,
			congestion: segment.congestion,
			incidents: segment.incidents || [],
			timestamp: Date.now(),
		}));

		// Emit event for map layer update
		if (options.onTrafficUpdate) {
			options.onTrafficUpdate(trafficData.value);
		}
	};

	// Update venue status
	const updateVenueStatus = (data) => {
		const { venueId, status, crowdLevel, waitTime, lastSeen } = data;

		venueStatuses.value.set(venueId, {
			status, // 'open', 'closed', 'busy', 'quiet'
			crowdLevel, // 0-100
			waitTime, // minutes
			lastSeen: lastSeen || Date.now(),
			isLive: status === "open" && Date.now() - (lastSeen || 0) < 300000, // 5 min
		});

		// Emit event for marker update
		if (options.onVenueStatusUpdate) {
			options.onVenueStatusUpdate(venueId, venueStatuses.value.get(venueId));
		}
	};

	// Update live events
	const updateLiveEvents = (data) => {
		const { eventId, action, event } = data;

		if (action === "add" || action === "update") {
			const index = liveEvents.value.findIndex((e) => e.id === eventId);
			if (index >= 0) {
				liveEvents.value[index] = { ...event, lastUpdate: Date.now() };
			} else {
				liveEvents.value.push({ ...event, lastUpdate: Date.now() });
			}
		} else if (action === "remove") {
			liveEvents.value = liveEvents.value.filter((e) => e.id !== eventId);
		}

		// Emit event for map update
		if (options.onEventUpdate) {
			options.onEventUpdate(liveEvents.value);
		}
	};

	// Update crowd density
	const updateCrowdDensity = (data) => {
		const { areaId, density, trend } = data;

		crowdDensity.value.set(areaId, {
			density, // 0-100
			trend, // 'increasing', 'stable', 'decreasing'
			timestamp: Date.now(),
		});

		// Emit event for heatmap update
		if (options.onCrowdDensityUpdate) {
			options.onCrowdDensityUpdate(Array.from(crowdDensity.value.entries()));
		}
	};

	// Update hotspots
	const updateHotspots = (data) => {
		if (!Array.isArray(data)) return;

		hotspots.value = data.map((hotspot) => ({
			id: hotspot.id,
			lat: hotspot.lat,
			lng: hotspot.lng,
			intensity: hotspot.intensity,
			category: hotspot.category,
			radius: hotspot.radius || 100,
			timestamp: Date.now(),
		}));

		// Emit event for hotspot visualization
		if (options.onHotspotsUpdate) {
			options.onHotspotsUpdate(hotspots.value);
		}
	};

	// Polling fallback for when WebSocket is not available
	const startPolling = () => {
		if (!options.apiUrl) return;

		// Traffic polling
		updateIntervals.traffic = setInterval(async () => {
			try {
				const response = await fetch(`${options.apiUrl}/traffic`);
				const data = await response.json();
				updateTrafficData(data);
			} catch (error) {
				logError("[Realtime] Traffic polling error:", error);
			}
		}, UPDATE_INTERVALS.traffic);

		// Venue status polling
		updateIntervals.venues = setInterval(async () => {
			try {
				const response = await fetch(`${options.apiUrl}/venues/status`);
				const data = await response.json();
				for (const venue of data) {
					updateVenueStatus(venue);
				}
			} catch (error) {
				logError("[Realtime] Venue polling error:", error);
			}
		}, UPDATE_INTERVALS.venues);

		// Events polling
		updateIntervals.events = setInterval(async () => {
			try {
				const response = await fetch(`${options.apiUrl}/events/live`);
				const data = await response.json();
				liveEvents.value = data;
				if (options.onEventUpdate) {
					options.onEventUpdate(data);
				}
			} catch (error) {
				logError("[Realtime] Events polling error:", error);
			}
		}, UPDATE_INTERVALS.events);

		// Crowd density polling
		updateIntervals.crowdDensity = setInterval(async () => {
			try {
				const response = await fetch(`${options.apiUrl}/crowd-density`);
				const data = await response.json();
				for (const area of data) {
					updateCrowdDensity(area);
				}
			} catch (error) {
				logError("[Realtime] Crowd density polling error:", error);
			}
		}, UPDATE_INTERVALS.crowdDensity);

		// Hotspots polling
		updateIntervals.hotspots = setInterval(async () => {
			try {
				const response = await fetch(`${options.apiUrl}/hotspots`);
				const data = await response.json();
				updateHotspots(data);
			} catch (error) {
				logError("[Realtime] Hotspots polling error:", error);
			}
		}, UPDATE_INTERVALS.hotspots);
	};

	// Stop polling
	const stopPolling = () => {
		Object.values(updateIntervals).forEach((interval) => {
			if (interval) clearInterval(interval);
		});
		updateIntervals = {};
	};

	// Get venue status
	const getVenueStatus = (venueId) => {
		return venueStatuses.value.get(venueId) || null;
	};

	// Get crowd level for area
	const getCrowdLevel = (areaId) => {
		return crowdDensity.value.get(areaId) || null;
	};

	// Check if venue is live
	const isVenueLive = (venueId) => {
		const status = venueStatuses.value.get(venueId);
		return status?.isLive || false;
	};

	// Get nearby hotspots
	const getNearbyHotspots = (lat, lng, radiusKm = 1) => {
		return hotspots.value.filter((hotspot) => {
			const distance = calculateDistance(lat, lng, hotspot.lat, hotspot.lng);
			return distance <= radiusKm;
		});
	};

	// Calculate distance between two points (Haversine formula)
	const calculateDistance = (lat1, lng1, lat2, lng2) => {
		const R = 6371; // Earth's radius in km
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLng = ((lng2 - lng1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos((lat1 * Math.PI) / 180) *
				Math.cos((lat2 * Math.PI) / 180) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	};

	// Initialize
	const init = () => {
		isShuttingDown = false;
		if (options.wsUrl) {
			connectWebSocket();
		} else if (options.apiUrl) {
			startPolling();
		}
	};

	// Cleanup
	const cleanup = () => {
		isShuttingDown = true;
		if (ws) {
			ws.close();
			ws = null;
		}

		stopPolling();

		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
	};

	if (getCurrentInstance()) {
		onUnmounted(cleanup);
	}

	return {
		trafficData,
		venueStatuses,
		liveEvents,
		crowdDensity,
		hotspots,
		isConnected,
		lastUpdate,
		getVenueStatus,
		getCrowdLevel,
		isVenueLive,
		getNearbyHotspots,
		init,
		cleanup,
	};
}
