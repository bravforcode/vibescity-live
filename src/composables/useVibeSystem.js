import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { runCommitMutation } from "@/composables/useOptimisticUpdate";
import i18n from "@/i18n.js";
import vibeService from "../services/vibeService";

export function useVibeSystem() {
	// State
	const isClaiming = ref(false);
	const claimCooldown = ref(null);
	const zoneVibes = ref([]);
	const placeVibes = ref(new Map());
	const leaderboard = ref(null);
	const systemStatus = ref(null);
	const lastError = ref(null);

	// Computed
	const totalVibePoints = computed(() => {
		let total = 0;
		zoneVibes.value.forEach((zone) => {
			total += zone.current_vibe * 100; // Convert to points
		});
		return total;
	});

	const activeZones = computed(() => {
		return zoneVibes.value.filter((zone) => zone.active_users > 0);
	});

	const topContributor = computed(() => {
		return leaderboard.value?.leaderboard?.[0] || null;
	});

	const canClaimVibe = computed(() => {
		return !claimCooldown.value || claimCooldown.value <= Date.now();
	});

	const cooldownMinutes = computed(() => {
		if (!claimCooldown.value) return 0;
		const remaining = Math.max(0, claimCooldown.value - Date.now());
		return Math.ceil(remaining / 60000);
	});

	// Methods
	const runClaimVibe = async ({
		placeId = null,
		zoneId = null,
		analyticsAction,
		successMessage,
	}) => {
		if (!canClaimVibe.value) {
			throw new Error(i18n.global.t("auto.k_53a492d5"));
		}

		isClaiming.value = true;
		lastError.value = null;

		try {
			const result = await runCommitMutation({
				commit: () => vibeService.claimVibe(placeId, zoneId, getUserId()),
				onSuccess: (data) => {
					claimCooldown.value = new Date(data.next_claim_time).getTime();
					vibeService.trackVibeInteraction(analyticsAction, placeId, zoneId);
					vibeService.emitVibeUpdate(placeId, zoneId, {
						action: "claimed",
						points: data.vibe_points,
						timestamp: new Date().toISOString(),
					});
					showVibeSuccess(successMessage(data));
				},
				onError: (error) => {
					lastError.value = String(error?.message || "Failed to claim vibe");
					showVibeError(lastError.value);
				},
				errorMessage: (error) =>
					String(error?.message || "Failed to claim vibe"),
			});
			if (!result.success) {
				throw result.cause ?? new Error(result.error);
			}
			return result.data;
		} finally {
			isClaiming.value = false;
		}
	};

	const claimPlaceVibe = async (placeId) =>
		runClaimVibe({
			placeId,
			analyticsAction: "claim_place",
			successMessage: (result) => `Claimed ${result.vibe_points} vibe points!`,
		});

	const claimZoneVibe = async (zoneId) => {
		return runClaimVibe({
			zoneId,
			analyticsAction: "claim_zone",
			successMessage: (result) =>
				`Claimed ${result.vibe_points} zone vibe points!`,
		});
	};

	const loadZoneVibes = async () => {
		try {
			const zones = await vibeService.getZoneVibes();
			zoneVibes.value = zones;
		} catch (error) {
			lastError.value = error.message;
			console.error("[useVibeSystem] Failed to load zone vibes:", error);
		}
	};

	const loadPlaceVibe = async (placeId) => {
		try {
			const vibe = await vibeService.getPlaceVibe(placeId);
			if (vibe) {
				placeVibes.value.set(placeId, vibe);
			}
		} catch (error) {
			lastError.value = error.message;
			console.error("[useVibeSystem] Failed to load place vibe:", error);
		}
	};

	const loadLeaderboard = async () => {
		try {
			const board = await vibeService.getLeaderboard();
			leaderboard.value = board;
		} catch (error) {
			lastError.value = error.message;
			console.error("[useVibeSystem] Failed to load leaderboard:", error);
		}
	};

	const loadSystemStatus = async () => {
		try {
			const status = await vibeService.getSystemStatus();
			systemStatus.value = status;
		} catch (error) {
			lastError.value = error.message;
			console.error("[useVibeSystem] Failed to load system status:", error);
		}
	};

	// Real-time updates
	const setupRealtimeUpdates = () => {
		vibeService.subscribeToVibeUpdates((data) => {
			if (data.place_id && placeVibes.value.has(data.place_id)) {
				// Update existing place vibe
				const current = placeVibes.value.get(data.place_id);
				placeVibes.value.set(data.place_id, {
					...current,
					...data.data,
				});
			}

			if (data.zone_id) {
				// Update zone vibes
				const zoneIndex = zoneVibes.value.findIndex(
					(z) => z.zone_id === data.zone_id,
				);
				if (zoneIndex !== -1) {
					const updatedZones = [...zoneVibes.value];
					updatedZones[zoneIndex] = {
						...updatedZones[zoneIndex],
						...data.data,
					};
					zoneVibes.value = updatedZones;
				}
			}
		});
	};

	// UI Feedback
	const showVibeSuccess = (message) => {
		// Create floating notification
		if (typeof window !== "undefined") {
			const event = new CustomEvent("vibe-notification", {
				detail: { type: "success", message },
			});
			window.dispatchEvent(event);
		}
	};

	const showVibeError = (message) => {
		// Create error notification
		if (typeof window !== "undefined") {
			const event = new CustomEvent("vibe-notification", {
				detail: { type: "error", message },
			});
			window.dispatchEvent(event);
		}
	};

	// Utility functions
	const getUserId = () => {
		// Get from visitor identity system
		return localStorage.getItem("vibe_visitor_id") || "anonymous";
	};

	const formatVibeLevel = (vibe) => {
		if (vibe >= 0.8) return "HIGH";
		if (vibe >= 0.5) return "MODERATE";
		if (vibe >= 0.2) return "LOW";
		return "QUIET";
	};

	const getVibeColor = (level) => {
		const colors = {
			HIGH: "#ec4899",
			MODERATE: "#f59e0b",
			LOW: "#3b82f6",
			QUIET: "#6b7280",
		};
		return colors[level] || "#6b7280";
	};

	// Auto-refresh
	let refreshInterval = null;
	const startAutoRefresh = () => {
		refreshInterval = setInterval(() => {
			loadSystemStatus();
		}, 30000); // 30 seconds
	};

	const stopAutoRefresh = () => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	};

	// Lifecycle
	onMounted(() => {
		loadZoneVibes();
		loadLeaderboard();
		loadSystemStatus();
		setupRealtimeUpdates();
		startAutoRefresh();
	});

	onUnmounted(() => {
		stopAutoRefresh();
	});

	// Watch for cooldown changes
	watch(claimCooldown, (newCooldown) => {
		if (newCooldown && newCooldown > Date.now()) {
			// Start countdown timer
			const countdown = setInterval(() => {
				const now = Date.now();
				if (now >= newCooldown) {
					clearInterval(countdown);
					claimCooldown.value = null;
				} else {
					const remaining = Math.ceil((newCooldown - now) / 1000);
					// Update UI with remaining time
				}
			}, 1000);
		}
	});

	return {
		// State
		isClaiming,
		claimCooldown,
		zoneVibes,
		placeVibes,
		leaderboard,
		systemStatus,
		lastError,

		// Computed
		totalVibePoints,
		activeZones,
		topContributor,
		canClaimVibe,
		cooldownMinutes,

		// Methods
		claimPlaceVibe,
		claimZoneVibe,
		loadZoneVibes,
		loadPlaceVibe,
		loadLeaderboard,
		loadSystemStatus,
		formatVibeLevel,
		getVibeColor,

		// Cleanup
		stopAutoRefresh,
	};
}
