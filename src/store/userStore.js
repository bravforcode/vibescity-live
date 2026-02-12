/**
 * 📁 src/store/userStore.js
 * ✅ User Authentication & Profile Store
 * Enterprise-grade with Supabase Auth integration
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { supabase } from "../lib/supabase";

// Constants
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 2000, 5000];
const DEFAULT_AVATAR = (seed) =>
	`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

export const useUserStore = defineStore(
	"user",
	() => {
		// ═══════════════════════════════════════════
		// 🔐 Authentication State
		// ═══════════════════════════════════════════
		const session = ref(null);
		const isLoading = ref(true);
		const authError = ref(null);
		const authInitialized = ref(false);

		// ═══════════════════════════════════════════
		// 👤 Profile State
		// ═══════════════════════════════════════════
		const profile = ref({
			id: null,
			username: "VibeExplorer",
			displayName: "Guest User",
			avatar: DEFAULT_AVATAR("Vibe"),
			bio: "Exploring the best vibes in town! 🎉",
			level: 1,
			xp: 0,
			totalCoins: 0,
			badges: [],
			joinedAt: null,
		});

		// ═══════════════════════════════════════════
		// ⚙️ Preferences State
		// ═══════════════════════════════════════════
		const preferences = ref({
			language: "th",
			theme: "dark",
			notificationsEnabled: true,
			hapticFeedback: true,
			autoPlayVideos: true,
			mapStyle: "vibrant", // vibrant | minimal | satellite
		});

		// ═══════════════════════════════════════════
		// 📊 Computed Properties
		// ═══════════════════════════════════════════
		const isAuthenticated = computed(() => !!session.value?.user);
		const userId = computed(() => session.value?.user?.id || null);
		const userEmail = computed(() => session.value?.user?.email || null);
		const isAdmin = computed(() => {
			const r = session.value?.user?.app_metadata?.role;
			const rs = session.value?.user?.app_metadata?.roles || [];
			return r === "admin" || rs.includes("admin");
		});
		const isDarkMode = computed(() => preferences.value.theme === "dark");

		const currentLevel = computed(() => {
			const xp = profile.value.xp;
			for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
				if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
			}
			return 1;
		});

		const levelProgress = computed(() => {
			const level = currentLevel.value;
			const currentXP = profile.value.xp;
			const prevThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
			const nextThreshold =
				LEVEL_THRESHOLDS[level] ||
				LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
			return Math.min(
				1,
				(currentXP - prevThreshold) / (nextThreshold - prevThreshold),
			);
		});

		const xpToNextLevel = computed(() => {
			const level = currentLevel.value;
			const nextThreshold =
				LEVEL_THRESHOLDS[level] ||
				LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
			return Math.max(0, nextThreshold - profile.value.xp);
		});

		// ═══════════════════════════════════════════
		// 🔐 Auth Actions
		// ═══════════════════════════════════════════
		const initAuth = async () => {
			if (authInitialized.value) return;
			authInitialized.value = true;

			isLoading.value = true;
			try {
				const {
					data: { session: s },
				} = await supabase.auth.getSession();
				session.value = s;
				if (s?.user) await fetchProfile(s.user.id);
			} catch (e) {
				console.error("❌ Auth init failed:", e);
				authError.value = e.message;
			} finally {
				isLoading.value = false;
			}

			// Listen for auth changes
			supabase.auth.onAuthStateChange(async (event, s) => {
				session.value = s;
				if (event === "SIGNED_IN" && s?.user) {
					await fetchProfile(s.user.id);
				} else if (event === "SIGNED_OUT") {
					resetProfile();
				}
			});
		};

		const login = async ({ email, password }) => {
			isLoading.value = true;
			authError.value = null;
			try {
				const { data, error } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
				return { success: true, user: data.user };
			} catch (e) {
				authError.value = e.message;
				return { success: false, error: e.message };
			} finally {
				isLoading.value = false;
			}
		};

		const loginWithProvider = async (provider) => {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: { redirectTo: `${window.location.origin}/auth/callback` },
			});
			if (error) authError.value = error.message;
		};

		const logout = async () => {
			await supabase.auth.signOut();
			resetProfile();
		};

		// ═══════════════════════════════════════════
		// 👤 Profile Actions
		// ═══════════════════════════════════════════
		const fetchProfile = async (uid) => {
			try {
				const { data, error } = await supabase
					.from("user_profiles")
					.select("*")
					.eq("user_id", uid)
					.single();

				if (error && error.code !== "PGRST116") throw error;
				if (data) Object.assign(profile.value, data);
			} catch (e) {
				console.error("❌ Profile fetch failed:", e);
			}
		};

		const updateProfile = async (updates) => {
			if (!userId.value) return { success: false };

			// Optimistic update
			const oldProfile = { ...profile.value };
			Object.assign(profile.value, updates);

			try {
				const { error } = await supabase.from("user_profiles").upsert({
					user_id: userId.value,
					...updates,
					updated_at: new Date().toISOString(),
				});

				if (error) throw error;
				return { success: true };
			} catch (e) {
				profile.value = oldProfile; // Rollback
				return { success: false, error: e.message };
			}
		};

		const addXP = async (amount, source = "unknown") => {
			const oldLevel = currentLevel.value;
			profile.value.xp += amount;

			const newLevel = currentLevel.value;
			const leveledUp = newLevel > oldLevel;

			// Sync to DB if authenticated
			if (userId.value) {
				await supabase
					.from("xp_logs")
					.insert({
						user_id: userId.value,
						amount,
						source,
						new_total: profile.value.xp,
					})
					.catch(console.error);
			}

			return { leveledUp, newLevel, xpGained: amount };
		};

		const resetProfile = () => {
			profile.value = {
				id: null,
				username: "VibeExplorer",
				displayName: "Guest User",
				avatar: DEFAULT_AVATAR("Vibe"),
				bio: "Exploring the best vibes!",
				level: 1,
				xp: 0,
				totalCoins: 0,
				badges: [],
				joinedAt: null,
			};
		};

		// ═══════════════════════════════════════════
		// ⚙️ Preferences Actions
		// ═══════════════════════════════════════════
		const setLanguage = (lang) => {
			preferences.value.language = lang;
		};
		const setTheme = (theme) => {
			preferences.value.theme = theme;
		};
		const toggleDarkMode = () => {
			preferences.value.theme = isDarkMode.value ? "light" : "dark";
		};
		const updatePreferences = (updates) => {
			Object.assign(preferences.value, updates);
		};

		// Apply theme to document
		watch(
			() => preferences.value.theme,
			(theme) => {
				if (typeof document === "undefined") return;

				const isDark = theme === "dark";
				document.documentElement.classList.toggle("dark", isDark);

				// Runtime theme hook for tokenized CSS (Night Neon default).
				document.documentElement.dataset.theme = isDark ? "night" : "day";

				// Hint native UI controls where supported.
				document.documentElement.style.colorScheme = isDark ? "dark" : "light";
			},
			{ immediate: true },
		);

		return {
			// State
			session,
			profile,
			preferences,
			isLoading,
			authError,
			authInitialized,
			// Computed
			isAuthenticated,
			userId,
			userEmail,
			isAdmin,
			isDarkMode,
			currentLevel,
			levelProgress,
			xpToNextLevel,
			// Auth Actions
			initAuth,
			login,
			loginWithProvider,
			logout,
			// Profile Actions
			fetchProfile,
			updateProfile,
			addXP,
			resetProfile,
			// Preferences Actions
			setLanguage,
			setTheme,
			toggleDarkMode,
			updatePreferences,
		};
	},
	{
		persist: {
			paths: ["preferences", "profile.username", "profile.avatar"],
			key: "vibe-user",
		},
	},
);
