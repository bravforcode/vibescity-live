import { onMounted, onUnmounted, ref } from "vue";

export function useHardwareInfo() {
	const isLowPowerMode = ref(false);
	const isSlowNetwork = ref(false);
	const prefersReducedMotion = ref(false);

	// Connection info update handler
	const updateNetworkInfo = () => {
		if (navigator.connection) {
			const type = navigator.connection.effectiveType;
			const saveData = navigator.connection.saveData;
			isSlowNetwork.value = saveData || type === "2g" || type === "3g";
		} else {
			isSlowNetwork.value = false;
		}
	};

	// Battery info
	let batteryManager = null;
	const updateBatteryInfo = () => {
		if (batteryManager) {
			// Consider low power if < 20% and not charging
			isLowPowerMode.value =
				!batteryManager.charging && batteryManager.level <= 0.2;
		}
	};

	// Media match handler
	const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	const updateMotionPreference = (e) => {
		prefersReducedMotion.value = e.matches;
	};

	onMounted(() => {
		// 1. Network setup
		updateNetworkInfo();
		if (navigator.connection) {
			navigator.connection.addEventListener("change", updateNetworkInfo);
		}

		// 2. Battery setup
		if ("getBattery" in navigator) {
			navigator
				.getBattery()
				.then((battery) => {
					batteryManager = battery;
					updateBatteryInfo();
					batteryManager.addEventListener("levelchange", updateBatteryInfo);
					batteryManager.addEventListener("chargingchange", updateBatteryInfo);
				})
				.catch(() => {
					// Battery API might be blocked or deprecated on some browsers
					console.warn("Battery API not available or permitted.");
				});
		}

		// 3. Motion preference setup
		prefersReducedMotion.value = mediaQuery.matches;
		mediaQuery.addEventListener("change", updateMotionPreference);
	});

	onUnmounted(() => {
		if (navigator.connection) {
			navigator.connection.removeEventListener("change", updateNetworkInfo);
		}
		if (batteryManager) {
			batteryManager.removeEventListener("levelchange", updateBatteryInfo);
			batteryManager.removeEventListener("chargingchange", updateBatteryInfo);
		}
		mediaQuery.removeEventListener("change", updateMotionPreference);
	});

	return {
		isLowPowerMode,
		isSlowNetwork,
		prefersReducedMotion,
	};
}
