import { useNetwork } from "@vueuse/core";
import { watch } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import { setNetworkOnlineState } from "@/services/networkState";
import { useFavoritesStore } from "@/store/favoritesStore";

export const useNetworkResilience = () => {
	const { isOnline } = useNetwork();
	const favoritesStore = useFavoritesStore();
	const { notifyError } = useNotifications();

	watch(
		isOnline,
		(nextValue) => {
			setNetworkOnlineState(Boolean(nextValue));
			if (nextValue) {
				void favoritesStore.flushOfflineFavorites().catch((error) => {
					if (import.meta.env.DEV) {
						console.error("[NetworkResilience] Offline sync failed", error);
					}
					notifyError("Could not sync queued actions yet.");
				});
			}
		},
		{ immediate: true },
	);

	return {
		isOnline,
	};
};
