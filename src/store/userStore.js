import { defineStore } from "pinia";

export const useUserStore = defineStore("user", {
	state: () => ({
		// Authentication
		token: localStorage.getItem("vibe_token") || null,
		isAuthenticated: !!localStorage.getItem("vibe_token"),

		// User Profile
		profile: {
			id: null,
			username: "VibeExplorer",
			displayName: "Guest User",
			avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Vibe",
			bio: "Exploring the best vibes in town!",
			level: 1,
			xp: 0,
		},

		// Settings & Preferences
		preferences: {
			language: localStorage.getItem("vibe_lang") || "th",
			isDarkMode: localStorage.getItem("vibe_theme") !== "light",
			notificationsEnabled: false,
		},
	}),

	actions: {
		// Auth actions (Groundwork for Phase 4+)
		async login(credentials) {
			console.log("Logging in with:", credentials);
			// In Phase 4, this will call the API
			this.token = "mock_jwt_token_for_mvp";
			this.isAuthenticated = true;
			localStorage.setItem("vibe_token", this.token);
		},

		logout() {
			this.token = null;
			this.isAuthenticated = false;
			localStorage.removeItem("vibe_token");
		},

		// Profile actions
		updateProfile(newData) {
			this.profile = { ...this.profile, ...newData };
		},

		addXp(amount) {
			this.profile.xp += amount;
			if (this.profile.xp >= 100) {
				this.profile.level += 1;
				this.profile.xp = 0;
				return true; // Leveled up
			}
			return false;
		},

		// Preferences actions
		setLanguage(lang) {
			this.preferences.language = lang;
			localStorage.setItem("vibe_lang", lang);
		},

		toggleDarkMode() {
			this.preferences.isDarkMode = !this.preferences.isDarkMode;
			localStorage.setItem(
				"vibe_theme",
				this.preferences.isDarkMode ? "dark" : "light",
			);
		},
	},
});
