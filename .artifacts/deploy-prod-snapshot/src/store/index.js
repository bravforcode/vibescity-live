/**
 * 📁 src/store/index.js
 * ✅ Store Export Hub - Centralized Store Management
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  VIBE CITY ENTERTAINMENT MAP - PINIA STORE ARCHITECTURE      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      ║
 * ║  │  userStore  │───▶│  coinStore  │───▶│  shopStore  │      ║
 * ║  │   (Auth)    │    │ (Gamification)   │   (Venues)  │      ║
 * ║  └─────────────┘    └─────────────┘    └─────────────┘      ║
 * ║         │                  │                  │              ║
 * ║         ▼                  ▼                  ▼              ║
 * ║  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      ║
 * ║  │ preferences │    │  favorites  │    │  location   │      ║
 * ║  │   Store     │    │   Store     │    │   Store     │      ║
 * ║  └─────────────┘    └─────────────┘    └─────────────┘      ║
 * ║         │                                    │              ║
 * ║         └──────────────┬────────────────────┘              ║
 * ║                        ▼                                    ║
 * ║                 ┌─────────────┐                             ║
 * ║                 │  roomStore  │                             ║
 * ║                 │ (Real-time) │                             ║
 * ║                 └─────────────┘                             ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

// ═══════════════════════════════════════════
// 📦 Store Exports
// ═══════════════════════════════════════════
export { useCoinStore } from "./coinStore";
export { useFavoritesStore } from "./favoritesStore";
export { useLocationStore } from "./locationStore";
export { useRoomStore } from "./roomStore";
export { useShopStore } from "./shopStore";
export { useUserPreferencesStore } from "./userPreferencesStore";
export { useUserStore } from "./userStore";

// ═══════════════════════════════════════════
// 🏭 Pinia Factory
// ═══════════════════════════════════════════
export const createVibeStore = () => {
	const pinia = createPinia();

	// Add persistence plugin
	pinia.use(piniaPluginPersistedstate);

	// Development logging
	if (import.meta.env.DEV) {
		pinia.use(({ store }) => {
			store.$onAction(({ name, after, onError }) => {
				const start = performance.now();
				after(() => {
					const duration = (performance.now() - start).toFixed(2);
					console.log(`🔄 [${store.$id}] ${name} (${duration}ms)`);
				});
				onError((error) => {
					console.error(`❌ [${store.$id}] ${name} failed:`, error);
				});
			});
		});
	}

	return pinia;
};

// ═══════════════════════════════════════════
// 🎯 Composable for All Stores
// ═══════════════════════════════════════════
export const useStores = () => {
	const user = useUserStore();
	const shop = useShopStore();
	const location = useLocationStore();
	const favorites = useFavoritesStore();
	const coins = useCoinStore();
	const room = useRoomStore();
	const preferences = useUserPreferencesStore();

	return { user, shop, location, favorites, coins, room, preferences };
};

// ═══════════════════════════════════════════
// 🚀 Store Initialization Helper
// ═══════════════════════════════════════════
export const initializeStores = async () => {
	const stores = useStores();

	if (import.meta.env.DEV) console.log("🚀 Initializing Vibe City Stores...");

	// Initialize in parallel where possible
	await Promise.all([
		stores.user.initAuth(),
		stores.shop.fetchShops(),
		stores.location.getCurrentPosition().catch(() => {
			stores.location.useDefaultLocation();
		}),
	]);

	// Subscribe to real-time updates
	stores.shop.subscribeToChanges();
	stores.room.subscribeToRoomCounts();

	if (import.meta.env.DEV) console.log("✅ All stores initialized!");

	return stores;
};

// ═══════════════════════════════════════════
// 🧹 Cleanup Helper
// ═══════════════════════════════════════════
export const cleanupStores = async () => {
	const stores = useStores();

	await Promise.all([
		stores.shop.unsubscribe(),
		stores.room.cleanup(),
		stores.location.stopWatching(),
	]);

	if (import.meta.env.DEV) console.log("🧹 Stores cleaned up");
};

// Default export
export default createVibeStore;
