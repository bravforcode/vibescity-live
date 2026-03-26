import i18n from "@/i18n.js";
import { apiFetch } from "./apiClient";

class VibeService {
	constructor() {
		this.baseURL = "/api/v1/vibe";
		this.cache = new Map();
		this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
	}

	// Cache management
	setCache(key, data) {
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
		});
	}

	getCache(key) {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
			return cached.data;
		}
		this.cache.delete(key);
		return null;
	}

	// Claim vibe for place or zone
	async claimVibe(placeId = null, zoneId = null, userId = "anonymous") {
		const cacheKey = `claim_${userId}`;

		// Check cooldown cache
		const cached = this.getCache(cacheKey);
		if (cached && cached.next_claim_time > Date.now()) {
			throw new Error(i18n.global.t("auto.k_deb987b1"));
		}

		try {
			const response = await apiFetch(`${this.baseURL}/claim`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					place_id: placeId,
					zone_id: zoneId,
					user_id: userId,
					vibe_type: placeId ? "place" : "zone",
				}),
			});

			const data = await response.json();

			// Cache the response to respect cooldown
			this.setCache(cacheKey, {
				next_claim_time: new Date(data.next_claim_time).getTime(),
			});

			return data;
		} catch (error) {
			console.error("[VibeService] Failed to claim vibe:", error);
			throw error;
		}
	}

	// Get zone vibes
	async getZoneVibes() {
		const cacheKey = "zones";
		const cached = this.getCache(cacheKey);
		if (cached) return cached;

		try {
			const response = await apiFetch(`${this.baseURL}/zones`);
			const data = await response.json();

			this.setCache(cacheKey, data);
			return data;
		} catch (error) {
			console.error("[VibeService] Failed to get zone vibes:", error);
			return [];
		}
	}

	// Get place vibe info
	async getPlaceVibe(placeId) {
		const cacheKey = `place_${placeId}`;
		const cached = this.getCache(cacheKey);
		if (cached) return cached;

		try {
			const response = await apiFetch(`${this.baseURL}/places/${placeId}`);
			const data = await response.json();

			this.setCache(cacheKey, data);
			return data;
		} catch (error) {
			console.error("[VibeService] Failed to get place vibe:", error);
			return null;
		}
	}

	// Get vibe leaderboard
	async getLeaderboard() {
		const cacheKey = "leaderboard";
		const cached = this.getCache(cacheKey);
		if (cached) return cached;

		try {
			const response = await apiFetch(`${this.baseURL}/leaderboard`);
			const data = await response.json();

			this.setCache(cacheKey, data);
			return data;
		} catch (error) {
			console.error("[VibeService] Failed to get leaderboard:", error);
			return null;
		}
	}

	// Get system status
	async getSystemStatus() {
		const cacheKey = "status";
		const cached = this.getCache(cacheKey);
		if (cached) return cached;

		try {
			const response = await apiFetch(`${this.baseURL}/status`);
			const data = await response.json();

			this.setCache(cacheKey, data, 30 * 1000); // 30 seconds cache
			return data;
		} catch (error) {
			console.error("[VibeService] Failed to get system status:", error);
			return null;
		}
	}

	// Real-time vibe updates (WebSocket integration)
	subscribeToVibeUpdates(callback) {
		// This would integrate with the existing socketService
		if (typeof window !== "undefined" && window.socketService) {
			window.socketService.addListener((data) => {
				if (data.type === "vibe_update") {
					callback(data.payload);
				}
			});
		}
	}

	// Emit vibe update (for real-time effects)
	emitVibeUpdate(placeId, zoneId, vibeData) {
		if (typeof window !== "undefined" && window.socketService) {
			window.socketService.send({
				type: "vibe_update",
				payload: {
					place_id: placeId,
					zone_id: zoneId,
					data: vibeData,
					timestamp: new Date().toISOString(),
				},
			});
		}
	}

	// Performance optimization: Batch vibe updates
	async batchUpdateVibes(updates) {
		const cacheKey = "batch_updates";

		try {
			const response = await apiFetch(`${this.baseURL}/batch-update`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ updates }),
			});

			const data = await response.json();

			// Clear relevant caches
			updates.forEach((update) => {
				if (update.place_id) {
					this.cache.delete(`place_${update.place_id}`);
				}
				if (update.zone_id) {
					this.cache.delete(`zones`);
				}
			});

			return data;
		} catch (error) {
			console.error("[VibeService] Failed to batch update vibes:", error);
			throw error;
		}
	}

	// Analytics: Track vibe interactions
	trackVibeInteraction(action, placeId, zoneId, userId = "anonymous") {
		const event = {
			action,
			place_id: placeId,
			zone_id: zoneId,
			user_id: userId,
			timestamp: new Date().toISOString(),
			session_id: this.getSessionId(),
		};

		// Send to analytics service
		if (typeof window !== "undefined" && window.gtag) {
			window.gtag("event", "vibe_interaction", {
				event_category: "vibe_system",
				event_label: action,
				custom_map: {
					place_id: placeId,
					zone_id: zoneId,
				},
			});
		}

		console.log("[VibeService] Tracked vibe interaction:", event);
	}

	// Session management
	getSessionId() {
		let sessionId = sessionStorage.getItem("vibe_session_id");
		if (!sessionId) {
			sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			sessionStorage.setItem("vibe_session_id", sessionId);
		}
		return sessionId;
	}

	// Clear cache (for testing or manual refresh)
	clearCache() {
		this.cache.clear();
	}

	// Get cache stats (for debugging)
	getCacheStats() {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys()),
			timeout: this.cacheTimeout,
		};
	}
}

// Singleton instance
export const vibeService = new VibeService();
export default vibeService;
