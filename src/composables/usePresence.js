import { computed } from "vue";
import { socketService } from "@/services/socketService";

/**
 * Composable providing real-time online-user count.
 * Reads reactive refs exposed by the singleton SocketService.
 *
 * @returns {{ onlineCount: import('vue').ComputedRef<number>, isConnected: import('vue').ComputedRef<boolean> }}
 */
export function usePresence() {
	const onlineCount = computed(() => socketService.onlineCount.value);
	const isConnected = computed(() => socketService.isConnected.value);

	return {
		onlineCount,
		isConnected,
	};
}
