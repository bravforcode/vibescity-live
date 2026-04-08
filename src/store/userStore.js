/**
 * 📁 src/store/userStore.js
 * ✅ User Authentication & Profile Store
 * Enterprise-grade with Supabase Auth integration
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import i18n from "@/i18n.js";
import { supabase } from "../lib/supabase";

// Constants
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 2000, 5000];
const DEFAULT_AVATAR = (seed) =>
	`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

// Admin emails must be configured via VITE_ADMIN_EMAIL_ALLOWLIST env var — never hardcode
const DEFAULT_ADMIN_EMAILS = new Set();

const normalizeEmail = (value) =>
	String(value || "")
		.trim()
		.toLowerCase();

const parseAdminEmailAllowlist = (raw) => {
	const out = new Set();
	String(raw || "")
		.split(",")
		.map((item) => normalizeEmail(item))
		.filter(Boolean)
		.forEach((email) => {
			out.add(email);
		});
	return out;
};

const ENV_ADMIN_EMAILS = parseAdminEmailAllowlist(
	import.meta.env.VITE_ADMIN_EMAIL_ALLOWLIST || "",
);

const collectRoles = (user) => {
	if (!user || typeof user !== "object") return new Set();
	const roles = new Set();
	const appMeta = user.app_metadata || {};
	const userMeta = user.user_metadata || {};

	const roleCandidates = [appMeta.role, userMeta.role];
	roleCandidates
		.map((value) =>
			String(value || "")
				.trim()
				.toLowerCase(),
		)
		.filter(Boolean)
		.forEach((role) => {
			roles.add(role);
		});

	const roleArrays = [
		Array.isArray(appMeta.roles) ? appMeta.roles : [],
		Array.isArray(userMeta.roles) ? userMeta.roles : [],
	];
	for (const arr of roleArrays) {
		for (const value of arr) {
			const role = String(value || "")
				.trim()
				.toLowerCase();
			if (role) roles.add(role);
		}
	}

	return roles;
};

const isAllowlistedAdmin = (user) => {
	const email = normalizeEmail(user?.email);
	if (!email) return false;
	return DEFAULT_ADMIN_EMAILS.has(email) || ENV_ADMIN_EMAILS.has(email);
};

const hasAdminRole = (user) => {
	const roles = collectRoles(user);
	return roles.has("admin") || roles.has("super_admin");
};

let authSubscription = null;

export const useUserStore = defineStore(
	"user",
	() => {
		// ═══════════════════════════════════════════
		// 🔐 Auth State
		// ═══════════════════════════════════════════
		const isLoading = ref(false);
		const isAuthInitialized = ref(false);
		const authSession = ref(null);
		const authUser = ref(null);

		// ═══════════════════════════════════════════
		// 👤 Profile State
		// ═══════════════════════════════════════════
		const profile = ref({
			id: null,
			username: "VibeExplorer",
			displayName: "Vibe Explorer",
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
			language: "en",
			theme: "dark",
			isSystemTheme: true, // Use system preference by default
			notificationsEnabled: true,
			hapticFeedback: true,
			autoPlayVideos: true,
			mapStyle: "vibrant", // vibrant | minimal | satellite
		});

		// ═══════════════════════════════════════════
		// 📊 Computed Properties
		// ═══════════════════════════════════════════
		const isAuthenticated = computed(
			() => Boolean(authSession.value?.access_token) && Boolean(authUser.value),
		);
		const userId = computed(() => authUser.value?.id || null);
		const userEmail = computed(() => normalizeEmail(authUser.value?.email));
		const roles = computed(() => collectRoles(authUser.value));
		const isAdmin = computed(
			() => hasAdminRole(authUser.value) || isAllowlistedAdmin(authUser.value),
		);
		const isDarkMode = computed(() => {
			if (preferences.value.isSystemTheme && typeof window !== "undefined") {
				return window.matchMedia("(prefers-color-scheme: dark)").matches;
			}
			return preferences.value.theme === "dark";
		});
		const hasRole = (role) =>
			roles.value.has(
				String(role || "")
					.trim()
					.toLowerCase(),
			);

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

		const applyAuthSnapshot = (session) => {
			authSession.value = session || null;
			authUser.value = session?.user || null;
		};

		const setupAuthListener = () => {
			if (authSubscription) return;
			const { data } = supabase.auth.onAuthStateChange((_event, session) => {
				applyAuthSnapshot(session);
			});
			authSubscription = data?.subscription || null;
		};

		const initAuth = async () => {
			if (isAuthInitialized.value) return;
			if (isLoading.value) return;
			isLoading.value = true;
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				applyAuthSnapshot(session);
				setupAuthListener();
				isAuthInitialized.value = true;
			} catch {
				applyAuthSnapshot(null);
			} finally {
				isLoading.value = false;
			}
		};

		const refreshAuth = async () => {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				applyAuthSnapshot(session);
				return session;
			} catch {
				applyAuthSnapshot(null);
				return null;
			}
		};

		const loginWithPassword = async ({ email, password }) => {
			const safeEmail = normalizeEmail(email);
			const safePassword = String(password || "");
			if (!safeEmail || !safePassword) {
				throw new Error(i18n.global.t("auto.k_3a8b67ff"));
			}

			let lastError = null;
			for (let attempt = 1; attempt <= 3; attempt += 1) {
				const { data, error } = await supabase.auth.signInWithPassword({
					email: safeEmail,
					password: safePassword,
				});
				if (!error) {
					applyAuthSnapshot(data?.session || null);
					isAuthInitialized.value = true;
					setupAuthListener();
					return data;
				}

				lastError = error;
				const message = String(error?.message || "").toLowerCase();
				const retryable =
					message.includes("upstream request timeout") ||
					message.includes("temporarily unavailable") ||
					message.includes("service unavailable");
				if (!retryable || attempt === 3) break;
				await new Promise((resolve) => setTimeout(resolve, attempt * 350));
			}

			throw lastError || new Error("Login failed");
		};

		const sendAdminMagicLink = async (email) => {
			const safeEmail = normalizeEmail(email);
			if (!safeEmail) throw new Error(i18n.global.t("auto.k_b48f14d9"));
			const redirectTo =
				typeof window !== "undefined"
					? `${window.location.origin}/admin`
					: undefined;
			const { error } = await supabase.auth.signInWithOtp({
				email: safeEmail,
				options: {
					emailRedirectTo: redirectTo,
				},
			});
			if (error) throw error;
			return { success: true };
		};

		const logout = async () => {
			// Tear down auth listener before sign-out to prevent stale callbacks
			if (authSubscription) {
				authSubscription.unsubscribe();
				authSubscription = null;
			}
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
			applyAuthSnapshot(null);
		};

		/** Cleanup for beforeunload / store teardown */
		const cleanup = () => {
			if (authSubscription) {
				authSubscription.unsubscribe();
				authSubscription = null;
			}
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
			const { coins, xp, level, ...profileUpdates } = updates || {};

			// Optimistic update
			const oldProfile = { ...profile.value };
			Object.assign(profile.value, profileUpdates);

			try {
				const { error } = await supabase.from("user_profiles").upsert({
					user_id: userId.value,
					...profileUpdates,
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
				displayName: "Vibe Explorer",
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
			preferences.value.isSystemTheme = false; // Override system preference
		};
		const toggleDarkMode = () => {
			const nextIsDark = !isDarkMode.value;
			preferences.value.theme = nextIsDark ? "dark" : "light";
			preferences.value.isSystemTheme = false;
		};
		const setUseSystemTheme = (val = true) => {
			preferences.value.isSystemTheme = val;
		};
		const updatePreferences = (updates) => {
			Object.assign(preferences.value, updates);
		};

		// Apply theme to document
		watch(
			isDarkMode,
			(isDark) => {
				if (typeof document === "undefined") return;

				document.documentElement.classList.toggle("dark", isDark);

				// Runtime theme hook for tokenized CSS (Night Neon default).
				document.documentElement.dataset.theme = isDark ? "night" : "day";

				// Hint native UI controls where supported.
				document.documentElement.style.colorScheme = isDark ? "dark" : "light";

				// Set global brightness variables based on accessibility guidelines
				document.documentElement.style.setProperty(
					"--vc-ui-brightness",
					isDark ? "1.0" : "0.95",
				);
				document.documentElement.style.setProperty(
					"--vc-ui-contrast",
					isDark ? "1.0" : "1.05",
				);
			},
			{ immediate: true },
		);

		// Watch for system preference changes
		if (typeof window !== "undefined") {
			window
				.matchMedia("(prefers-color-scheme: dark)")
				.addEventListener("change", () => {
					if (preferences.value.isSystemTheme) {
						// isDarkMode computed property will update automatically
					}
				});
		}

		return {
			// State
			profile,
			preferences,
			isLoading,
			isAuthInitialized,
			authSession,
			authUser,
			// Computed
			isAuthenticated,
			userId,
			userEmail,
			roles,
			hasRole,
			isAdmin,
			isDarkMode,
			currentLevel,
			levelProgress,
			xpToNextLevel,
			// Auth Actions
			initAuth,
			refreshAuth,
			loginWithPassword,
			sendAdminMagicLink,
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
			setUseSystemTheme,
			updatePreferences,
			// Lifecycle
			cleanup,
		};
	},
	{
		persist: {
			paths: ["preferences", "profile.username", "profile.avatar"],
			key: "vibe-user",
		},
	},
);
