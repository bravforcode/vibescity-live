import { onUnmounted, ref } from "vue";

export function useLocation() {
	const userCoords = ref(null);
	const locationError = ref(null);
	const isLocating = ref(false);
	const permissionStatus = ref("prompt"); // 'prompt', 'granted', 'denied'
	let watchId = null;

	const startTracking = () => {
		if (watchId !== null) return;

		isLocating.value = true;
		locationError.value = null;

		if (!navigator.geolocation) {
			locationError.value = "Geolocation is not supported by this browser.";
			isLocating.value = false;
			return;
		}

		if (navigator.permissions) {
			navigator.permissions.query({ name: "geolocation" }).then((result) => {
				permissionStatus.value = result.state;
				result.onchange = () => {
					permissionStatus.value = result.state;
				};
			});
		}

		/**
		 * Accuracy Optimization:
		 * - enableHighAccuracy: บังคับใช้ GPS จริง (บน PC จะพยายามหาจาก Wi-Fi ที่แม่นที่สุด)
		 * - timeout: เพิ่มเป็น 15 วินาทีเพื่อให้เครื่องมีเวลาคำนวณพิกัดที่ละเอียดขึ้น
		 * - maximumAge: 0 เพื่อให้แน่ใจว่าได้ค่าใหม่ล่าสุดเสมอ ไม่เอาค่าเก่าที่ค้างในแคช
		 */
		const options = {
			enableHighAccuracy: true,
			timeout: 15000,
			maximumAge: 0,
		};

		watchId = navigator.geolocation.watchPosition(
			(position) => {
				const { latitude, longitude, accuracy } = position.coords;
				userCoords.value = [latitude, longitude];
				locationError.value = null;
				isLocating.value = false;
				permissionStatus.value = "granted";

				// Debugging for accuracy (Optional)
				// console.log(`Accuracy: ${accuracy} meters`);
			},
			(error) => {
				isLocating.value = false;
				if (error.code === error.PERMISSION_DENIED) {
					permissionStatus.value = "denied";
					locationError.value =
						"Location access denied. Please enable it in browser settings.";
				} else if (error.code === error.TIMEOUT) {
					if (!userCoords.value) {
						locationError.value =
							"GPS signal lost or taking too long. Try an open area.";
					}
				} else {
					locationError.value = "Unable to retrieve your location.";
				}
			},
			options,
		);
	};

	const stopTracking = () => {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
	};

	onUnmounted(() => stopTracking());

	return {
		userCoords,
		locationError,
		isLocating,
		permissionStatus,
		startTracking,
		stopTracking,
	};
}
