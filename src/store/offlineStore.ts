import { useNetwork } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed } from "vue";

export const useOfflineStore = defineStore("offline", () => {
	const { isOnline } = useNetwork();
	const isOffline = computed(() => !isOnline.value);

	const init = () => {
		// Backward-compatible noop: network state is reactive via useNetwork.
	};

	return {
		isOffline,
		isOnline,
		init,
	};
});
