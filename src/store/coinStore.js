/**
 * 📁 src/store/coinStore.js
 * ✅ Gamification & Coins Store
 * Features: XP System, Achievements, Streaks, Leaderboard
 */
import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import { runOptimisticMutation } from "../composables/useOptimisticUpdate";
import { supabase } from "../lib/supabase";
import { gamificationService } from "../services/gamificationService";
import { bootstrapVisitor } from "../services/visitorIdentity";
import { logUnexpectedNetworkError } from "../utils/networkErrorUtils";
import {
	isSoftSupabaseReadError,
	logUnexpectedSupabaseReadError,
	runSupabaseReadPolicy,
} from "../utils/supabaseReadPolicy";
import { useUserStore } from "./userStore";

// ═══════════════════════════════════════════
// 🎮 Game Constants
// ═══════════════════════════════════════════
const LEVEL_CONFIG = [
	{ level: 1, xpRequired: 0, title: "Newbie Explorer", color: "#6b7280" },
	{ level: 2, xpRequired: 100, title: "Vibe Seeker", color: "#10b981" },
	{ level: 3, xpRequired: 300, title: "Night Owl", color: "#3b82f6" },
	{ level: 4, xpRequired: 600, title: "Party Animal", color: "#22d3ee" },
	{ level: 5, xpRequired: 1000, title: "Vibe Master", color: "#f59e0b" },
	{ level: 6, xpRequired: 2000, title: "Legend", color: "#ef4444" },
	{ level: 7, xpRequired: 5000, title: "Vibe God", color: "#ec4899" },
];

const COIN_VALUES = {
	CHECK_IN: 10,
	FIRST_VISIT: 25,
	REVIEW: 15,
	PHOTO_UPLOAD: 20,
	DAILY_STREAK: 5,
	ACHIEVEMENT: 50,
	REFERRAL: 100,
};

const ACHIEVEMENTS = [
	{
		id: "first_checkin",
		name: "First Steps",
		desc: "Check in to your first venue",
		icon: "🎉",
		coins: 25,
	},
	{
		id: "explorer_5",
		name: "Explorer",
		desc: "Visit 5 different venues",
		icon: "🧭",
		coins: 50,
	},
	{
		id: "explorer_25",
		name: "Adventurer",
		desc: "Visit 25 venues",
		icon: "🗺️",
		coins: 150,
	},
	{
		id: "reviewer",
		name: "Critic",
		desc: "Write 10 reviews",
		icon: "⭐",
		coins: 75,
	},
	{
		id: "streak_7",
		name: "Week Warrior",
		desc: "7-day check-in streak",
		icon: "🔥",
		coins: 100,
	},
	{
		id: "night_owl",
		name: "Night Owl",
		desc: "Check in after midnight",
		icon: "🦉",
		coins: 30,
	},
	{
		id: "social_butterfly",
		name: "Social Butterfly",
		desc: "Share 5 venues",
		icon: "🦋",
		coins: 40,
	},
];

export const useCoinStore = defineStore(
	"coins",
	() => {
		const userStore = useUserStore();

		// ═══════════════════════════════════════════
		// 📦 State
		// ═══════════════════════════════════════════
		const coins = ref(0);
		const totalEarned = ref(0);
		const collectedVenues = shallowRef([]); // shallowRef: IDs only, no deep proxy needed
		const achievements = ref([]); // Array of achievement IDs unlocked
		const dailyStreak = ref(0);
		const lastCheckInDate = ref(null);
		const pendingRewards = ref([]); // Queue for displaying rewards
		const isProcessing = ref(false);

		// ═══════════════════════════════════════════
		// 📊 Computed
		// ═══════════════════════════════════════════
		const collectedSet = computed(() => new Set(collectedVenues.value));
		const achievementSet = computed(() => new Set(achievements.value));
		const venuesVisited = computed(() => collectedVenues.value.length);

		const currentLevel = computed(() => {
			for (let i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
				if (coins.value >= LEVEL_CONFIG[i].xpRequired) return LEVEL_CONFIG[i];
			}
			return LEVEL_CONFIG[0];
		});

		const nextLevel = computed(() => {
			const idx = LEVEL_CONFIG.findIndex(
				(l) => l.level === currentLevel.value.level,
			);
			return LEVEL_CONFIG[idx + 1] || LEVEL_CONFIG[LEVEL_CONFIG.length - 1];
		});

		const levelProgress = computed(() => {
			const current = currentLevel.value.xpRequired;
			const next = nextLevel.value.xpRequired;
			if (next === current) return 1;
			return Math.min(1, (coins.value - current) / (next - current));
		});

		const xpToNextLevel = computed(() =>
			Math.max(0, nextLevel.value.xpRequired - coins.value),
		);
		const hasCollected = (venueId) => collectedSet.value.has(venueId);
		const hasAchievement = (achievementId) =>
			achievementSet.value.has(achievementId);
		const availableAchievements = computed(() =>
			ACHIEVEMENTS.filter((a) => !hasAchievement(a.id)),
		);

		// ═══════════════════════════════════════════
		// 🎯 Actions
		// ═══════════════════════════════════════════

		/**
		 * Check in to a venue
		 */
		/**
		 * Check in to a venue (Secure)
		 */
		const checkIn = async (venueId, _venueName = "") => {
			if (isProcessing.value) return { success: false, reason: "processing" };
			if (hasCollected(venueId))
				return { success: false, reason: "already_collected" };

			isProcessing.value = true;
			const rewards = [];

			try {
				// 1. Call Edge Function
				const { data, error } = await supabase.functions.invoke("coin-action", {
					body: { action_type: "check_in", venue_id: venueId },
				});

				if (error) throw error;
				if (!data.success) throw new Error(data.message);

				// 2. Update Local State (Optimistic or Confirmed)
				collectedVenues.value = [...collectedVenues.value, venueId];
				const coinsEarned = data.amount || 10;
				coins.value += coinsEarned;
				totalEarned.value += coinsEarned;

				rewards.push({
					type: "coins",
					amount: coinsEarned,
					reason: "Check-in",
				});

				// 3. Check Achievements (Client-side for UI feedback, Server should verify later)
				// For MVP, we presume server granted the coins, achievements are visual here.
				// Ideally, server returns unlocked_achievements.
				const isNightOwl = new Date().getHours() < 5;
				const newAchievements = checkForAchievements(isNightOwl);
				rewards.push(
					...newAchievements.map((a) => ({ type: "achievement", ...a })),
				);

				// Queue rewards
				pendingRewards.value = [...pendingRewards.value, ...rewards];

				return {
					success: true,
					coinsEarned,
					rewards,
					newLevel: currentLevel.value,
				};
			} catch (e) {
				if (import.meta.env.DEV) {
					logUnexpectedNetworkError("[coinStore] Check-in failed:", e);
				}
				return { success: false, reason: "error", error: e.message };
			} finally {
				isProcessing.value = false;
			}
		};

		/**
		 * Check for new achievements
		 */
		const checkForAchievements = (isNightOwl = false) => {
			const newAchievements = [];
			const count = collectedVenues.value.length;

			const checks = [
				{ id: "first_checkin", condition: count >= 1 },
				{ id: "explorer_5", condition: count >= 5 },
				{ id: "explorer_25", condition: count >= 25 },
				{ id: "streak_7", condition: dailyStreak.value >= 7 },
				{ id: "night_owl", condition: isNightOwl },
			];

			for (const check of checks) {
				if (check.condition && !hasAchievement(check.id)) {
					const achievement = ACHIEVEMENTS.find((a) => a.id === check.id);
					if (achievement) {
						achievements.value = [...achievements.value, check.id];
						coins.value += achievement.coins;
						totalEarned.value += achievement.coins;
						newAchievements.push(achievement);
					}
				}
			}

			return newAchievements;
		};

		/**
		 * Spend coins
		 */
		const spendCoins = async (amount, reason = "purchase") => {
			if (coins.value < amount)
				return { success: false, reason: "insufficient_funds" };

			if (!userStore.isAuthenticated) {
				coins.value -= amount;
				return { success: true, newBalance: coins.value };
			}

			const result = await runOptimisticMutation({
				capture: () => coins.value,
				applyOptimistic: () => {
					coins.value -= amount;
				},
				rollback: (snapshot) => {
					coins.value = Number.isFinite(snapshot) ? snapshot : 0;
				},
				commit: async () => {
					const { error } = await supabase.from("coin_transactions").insert({
						user_id: userStore.userId,
						amount: -amount,
						type: "SPEND",
						reason,
					});
					if (error) throw error;
					return true;
				},
				reportError: import.meta.env.DEV
					? (error) => {
							logUnexpectedNetworkError(
								"[coinStore] Failed to persist spent coins:",
								error,
							);
						}
					: undefined,
				errorMessage: (error) =>
					String(error?.message || "Unable to spend coins right now"),
			});

			if (!result.success) {
				return { success: false, reason: "error", error: result.error };
			}

			return { success: true, newBalance: coins.value };
		};

		/**
		 * Award bonus coins
		 */
		const awardBonus = async (amount, reason) => {
			coins.value += amount;
			totalEarned.value += amount;
			pendingRewards.value = [
				...pendingRewards.value,
				{ type: "coins", amount, reason },
			];

			if (navigator.vibrate) navigator.vibrate([20, 10, 40]);
			return { success: true, newBalance: coins.value };
		};

		/**
		 * Clear pending rewards (after displaying)
		 */
		const clearPendingReward = () => {
			pendingRewards.value = pendingRewards.value.slice(1);
		};

		/**
		 * Sync check-in to backend
		 */
		const syncCheckIn = async (venueId, venueName, coinsEarned) => {
			try {
				await supabase.from("gamification_logs").insert({
					user_id: userStore.userId,
					action_type: "CHECK_IN",
					coins_earned: coinsEarned,
					xp_earned: coinsEarned * 2,
					details: { venue_id: venueId, venue_name: venueName },
				});
			} catch (e) {
				if (import.meta.env.DEV) {
					logUnexpectedNetworkError("[coinStore] Sync failed:", e);
				}
			}
		};

		/**
		 * Fetch user stats from backend
		 */
		const fetchUserStats = async () => {
			try {
				// Always use gamification service (works for both auth + anonymous)
				await bootstrapVisitor({ forceRefresh: false }).catch(() => {});
				const status = await runSupabaseReadPolicy({
					resourceType: "gamificationStats",
					run: () => gamificationService.getDailyCheckinStatus(),
				});
				const balance = Number(status?.balance ?? 0);
				const streak = Number(status?.streak ?? 0);
				if (Number.isFinite(balance)) {
					const safeBalance = Math.max(0, Math.round(balance));
					coins.value = safeBalance;
					totalEarned.value = Math.max(totalEarned.value, safeBalance);
				}
				if (Number.isFinite(streak)) {
					dailyStreak.value = Math.max(0, Math.round(streak));
				}
			} catch (e) {
				if (isSoftSupabaseReadError(e)) {
					return;
				}
				if (import.meta.env.DEV) {
					logUnexpectedSupabaseReadError(
						"[coinStore] Failed to fetch stats:",
						e,
					);
				}
			}
		};

		// Auto-fetch on auth (only on login, reset on logout)
		watch(
			() => userStore.isAuthenticated,
			(isAuth) => {
				if (isAuth) {
					void fetchUserStats();
				} else {
					// Reset gamification state on logout
					coins.value = 0;
					totalEarned.value = 0;
					collectedVenues.value = [];
					achievements.value = [];
					dailyStreak.value = 0;
					lastCheckInDate.value = null;
					pendingRewards.value = [];
				}
			},
			{ immediate: true },
		);

		if (typeof window !== "undefined") {
			const syncOnReturn = () => {
				if (document.visibilityState === "hidden") return;
				void fetchUserStats();
			};
			window.addEventListener("focus", syncOnReturn, { passive: true });
			document.addEventListener("visibilitychange", syncOnReturn, {
				passive: true,
			});
			onScopeDispose(() => {
				window.removeEventListener("focus", syncOnReturn);
				document.removeEventListener("visibilitychange", syncOnReturn);
			});
		}

		return {
			// State
			coins,
			totalEarned,
			collectedVenues,
			achievements,
			dailyStreak,
			lastCheckInDate,
			pendingRewards,
			isProcessing,
			// Computed
			collectedSet,
			achievementSet,
			venuesVisited,
			currentLevel,
			nextLevel,
			levelProgress,
			xpToNextLevel,
			hasCollected,
			hasAchievement,
			availableAchievements,
			// Actions
			checkIn,
			spendCoins,
			awardBonus,
			clearPendingReward,
			fetchUserStats,
			// Legacy aliases
			totalCoins: coins,
			addCoin: checkIn,
			userLevel: computed(() => currentLevel.value.level),
			nextLevelXP: xpToNextLevel,
			// Constants
			LEVEL_CONFIG,
			COIN_VALUES,
			ACHIEVEMENTS,
		};
	},
	{
		persist: {
			paths: [
				"coins",
				"totalEarned",
				"collectedVenues",
				"achievements",
				"dailyStreak",
				"lastCheckInDate",
			],
			key: "vibe-coins",
		},
	},
);
