/**
 * 📁 src/store/roomStore.js
 * ✅ Real-time Room/Presence Store
 * Features: WebSocket presence, Live counts, Activity tracking
 */
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { supabase } from "../lib/supabase";
import {
	isSoftSupabaseReadError,
	logUnexpectedSupabaseReadError,
	runSupabaseReadPolicy,
} from "../utils/supabaseReadPolicy";
import { useUserStore } from "./userStore";

// Presence update throttle (ms)
const PRESENCE_THROTTLE = 5000;

export const useRoomStore = defineStore("room", () => {
	const userStore = useUserStore();

	// ═══════════════════════════════════════════
	// 📦 State
	// ═══════════════════════════════════════════
	const shopCounts = ref({}); // { shopId: count }
	const shopPresence = shallowRef({}); // { shopId: [users] }
	const currentRoomId = ref(null);
	const isConnected = ref(false);
	const connectionError = shallowRef(null);
	const lastActivity = ref({});

	let channel = null;
	let presenceChannel = null;
	let lastPresenceUpdate = 0;

	// ═══════════════════════════════════════════
	// 📊 Computed
	// ═══════════════════════════════════════════
	const getCount = (shopId) => shopCounts.value[shopId] || 0;
	const getPresence = (shopId) => shopPresence.value[shopId] || [];
	const isInRoom = computed(() => !!currentRoomId.value);
	const currentRoomCount = computed(() => getCount(currentRoomId.value));

	const hotSpots = computed(() => {
		return Object.entries(shopCounts.value)
			.filter(([_, count]) => count > 0)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([id, count]) => ({ id, count }));
	});

	const totalActiveUsers = computed(() =>
		Object.values(shopCounts.value).reduce((sum, c) => sum + c, 0),
	);

	// ═══════════════════════════════════════════
	// 🎯 Actions
	// ═══════════════════════════════════════════

	/**
	 * Update counts for multiple shops
	 */
	const updateCounts = (data) => {
		shopCounts.value = { ...shopCounts.value, ...data };
	};

	/**
	 * Update single shop count
	 */
	const updateSingleCount = (shopId, count) => {
		shopCounts.value = { ...shopCounts.value, [shopId]: Math.max(0, count) };
	};

	/**
	 * Increment/decrement count
	 */
	const adjustCount = (shopId, delta) => {
		const current = shopCounts.value[shopId] || 0;
		updateSingleCount(shopId, current + delta);
	};

	/**
	 * Subscribe to real-time room counts
	 */
	const subscribeToRoomCounts = async () => {
		if (channel) return;

		try {
			channel = supabase
				.channel("room-counts")
				.on("broadcast", { event: "count_update" }, (payload) => {
					updateCounts(payload.payload);
				})
				.subscribe((status) => {
					isConnected.value = status === "SUBSCRIBED";
					if (status === "CHANNEL_ERROR") {
						connectionError.value = "Failed to connect to room counts";
					}
				});

			if (import.meta.env.DEV) console.log("📡 Subscribed to room counts");
		} catch (e) {
			connectionError.value = e.message;
			if (import.meta.env.DEV) console.error("❌ Room subscription failed:", e);
		}
	};

	/**
	 * Join a specific room (venue)
	 */
	const joinRoom = async (shopId) => {
		if (currentRoomId.value === shopId) return;

		// Leave current room first
		if (currentRoomId.value) await leaveRoom();

		currentRoomId.value = shopId;

		try {
			presenceChannel = supabase
				.channel(`room:${shopId}`)
				.on("presence", { event: "sync" }, () => {
					const state = presenceChannel.presenceState();
					const users = Object.values(state).flat();
					shopPresence.value = { ...shopPresence.value, [shopId]: users };
					updateSingleCount(shopId, users.length);
				})
				.on("presence", { event: "join" }, ({ newPresences }) => {
					if (import.meta.env.DEV) console.log("👋 User joined:", newPresences);
				})
				.on("presence", { event: "leave" }, ({ leftPresences }) => {
					if (import.meta.env.DEV) console.log("👋 User left:", leftPresences);
				})
				.subscribe(async (status) => {
					if (status === "SUBSCRIBED") {
						// Announce presence with throttle
						await throttledPresenceUpdate(shopId);
					}
				});

			// Track activity
			lastActivity.value[shopId] = Date.now();
			if (import.meta.env.DEV) console.log(`🚪 Joined room: ${shopId}`);
		} catch (e) {
			if (import.meta.env.DEV) console.error("❌ Failed to join room:", e);
			currentRoomId.value = null;
		}
	};

	/**
	 * Leave current room
	 */
	const leaveRoom = async () => {
		if (!currentRoomId.value || !presenceChannel) return;

		try {
			await presenceChannel.untrack();
			await presenceChannel.unsubscribe();
			if (import.meta.env.DEV)
				console.log(`🚪 Left room: ${currentRoomId.value}`);
		} catch (e) {
			if (import.meta.env.DEV) console.error("❌ Error leaving room:", e);
		} finally {
			presenceChannel = null;
			currentRoomId.value = null;
		}
	};

	/**
	 * Throttled presence update
	 */
	const throttledPresenceUpdate = async (_shopId) => {
		const now = Date.now();
		if (now - lastPresenceUpdate < PRESENCE_THROTTLE) return;
		lastPresenceUpdate = now;

		await presenceChannel?.track({
			id: userStore.userId || `anon_${Math.random().toString(36).slice(2)}`,
			name: userStore.profile?.displayName || "Explorer",
			avatar: userStore.profile?.avatar,
			joinedAt: new Date().toISOString(),
		});
	};

	/**
	 * Broadcast count update (for admin/testing)
	 */
	const broadcastCount = async (shopId, count) => {
		if (!channel) return;
		await channel.send({
			type: "broadcast",
			event: "count_update",
			payload: { [shopId]: count },
		});
	};

	/**
	 * Fetch initial counts from API
	 */
	const fetchInitialCounts = async () => {
		try {
			const { data } = await runSupabaseReadPolicy({
				resourceType: "roomCounts",
				run: async () => {
					const result = await supabase
						.from("venue_live_counts")
						.select("venue_id, user_count");
					if (result.error) throw result.error;
					return result;
				},
			});

			if (data) {
				const counts = {};
				data.forEach((row) => {
					counts[row.venue_id] = row.user_count;
				});
				updateCounts(counts);
			}
		} catch (e) {
			if (isSoftSupabaseReadError(e)) {
				return;
			}
			if (import.meta.env.DEV) {
				logUnexpectedSupabaseReadError(
					"[roomStore] Failed to fetch counts:",
					e,
				);
			}
		}
	};

	/**
	 * Cleanup all subscriptions
	 */
	const cleanup = async () => {
		await leaveRoom();
		if (channel) {
			await channel.unsubscribe();
			channel = null;
		}
		isConnected.value = false;
	};

	return {
		// State
		shopCounts,
		shopPresence,
		currentRoomId,
		isConnected,
		connectionError,
		lastActivity,
		// Computed
		getCount,
		getPresence,
		isInRoom,
		currentRoomCount,
		hotSpots,
		totalActiveUsers,
		// Actions
		updateCounts,
		updateSingleCount,
		adjustCount,
		subscribeToRoomCounts,
		joinRoom,
		leaveRoom,
		broadcastCount,
		fetchInitialCounts,
		cleanup,
	};
});
