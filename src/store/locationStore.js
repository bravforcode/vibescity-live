/**
 * 📁 src/store/locationStore.js
 * ✅ Geolocation Store with Watch Position & Error Handling
 * Mobile-first with battery optimization
 */
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

// Chiang Mai default coordinates
const DEFAULT_LOCATION = { lat: 18.7883, lng: 98.9853 };
const LOCATION_OPTIONS = {
	enableHighAccuracy: true,
	timeout: 15000,
	maximumAge: 30000, // Cache for 30s to save battery
};
const MIN_UPDATE_DISTANCE_KM = 0.02; // ~20 meters

// Haversine formula for distance calculation
const calculateDistance = (lat1, lng1, lat2, lng2) => {
	const R = 6371; // Earth's radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const useLocationStore = defineStore(
	"location",
	() => {
		// ═══════════════════════════════════════════
		// 📍 State
		// ═══════════════════════════════════════════
		const userLocation = ref(null); // [lat, lng]
		const accuracy = ref(null); // meters
		const heading = ref(null); // degrees from north
		const speed = ref(null); // m/s
		const altitude = ref(null);
		const lastUpdated = ref(null);

		const isTracking = ref(false);
		const isLoading = ref(false);
		const isMockLocation = ref(false);
		const permissionStatus = ref("unknown"); // granted | denied | prompt | unknown
		const error = shallowRef(null);

		let watchId = null;

		// ═══════════════════════════════════════════
		// 📊 Computed
		// ═══════════════════════════════════════════
		const hasLocation = computed(() => !!userLocation.value);
		const locationObject = computed(() => {
			if (!userLocation.value) return null;
			return { lat: userLocation.value[0], lng: userLocation.value[1] };
		});
		const isHighAccuracy = computed(
			() => accuracy.value !== null && accuracy.value < 50,
		);
		const locationAge = computed(() => {
			if (!lastUpdated.value) return Infinity;
			return Date.now() - lastUpdated.value;
		});
		const isStale = computed(() => locationAge.value > 60000); // > 1 min

		// ═══════════════════════════════════════════
		// 🎯 Actions
		// ═══════════════════════════════════════════

		/**
		 * Normalize various location formats to [lat, lng]
		 */
		const normalizeLocation = (loc) => {
			if (!loc) return null;
			if (Array.isArray(loc) && loc.length >= 2) {
				return [Number(loc[0]), Number(loc[1])];
			}
			if (typeof loc === "object") {
				const lat = loc.lat ?? loc.latitude ?? loc.Latitude;
				const lng = loc.lng ?? loc.longitude ?? loc.Longitude ?? loc.lon;
				if (lat !== undefined && lng !== undefined) {
					return [Number(lat), Number(lng)];
				}
			}
			return null;
		};

		/**
		 * Set user location manually
		 */
		const setUserLocation = (loc, mock = false) => {
			const normalized = normalizeLocation(loc);
			if (!normalized) return false;

			const [lat, lng] = normalized;
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
			if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;

			userLocation.value = normalized;
			isMockLocation.value = mock;
			lastUpdated.value = Date.now();
			error.value = null;
			return true;
		};

		/**
		 * Request current position once
		 */
		const getCurrentPosition = () => {
			return new Promise((resolve, reject) => {
				if (!navigator.geolocation) {
					const err = new Error("Geolocation not supported");
					error.value = err;
					reject(err);
					return;
				}

				isLoading.value = true;
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						handlePositionSuccess(pos);
						isLoading.value = false;
						resolve(userLocation.value);
					},
					(err) => {
						handlePositionError(err);
						isLoading.value = false;
						reject(err);
					},
					LOCATION_OPTIONS,
				);
			});
		};

		/**
		 * Start watching position continuously
		 */
		const startWatching = async () => {
			if (isTracking.value || !navigator.geolocation) return;

			// Check permission first
			if (navigator.permissions) {
				try {
					const result = await navigator.permissions.query({
						name: "geolocation",
					});
					permissionStatus.value = result.state;
					result.addEventListener("change", () => {
						permissionStatus.value = result.state;
					});
				} catch {} // Some browsers don't support this
			}

			isTracking.value = true;
			isLoading.value = true;

			watchId = navigator.geolocation.watchPosition(
				handlePositionSuccess,
				handlePositionError,
				LOCATION_OPTIONS,
			);
		};

		/**
		 * Stop watching position
		 */
		const stopWatching = () => {
			if (watchId !== null) {
				navigator.geolocation.clearWatch(watchId);
				watchId = null;
			}
			isTracking.value = false;
		};

		/**
		 * Handle successful position update
		 */
		const handlePositionSuccess = (position) => {
			const {
				latitude,
				longitude,
				accuracy: acc,
				heading: h,
				speed: s,
				altitude: alt,
			} = position.coords;

			if (userLocation.value) {
				const [prevLat, prevLng] = userLocation.value;
				const dist = calculateDistance(prevLat, prevLng, latitude, longitude);
				const accuracyImproved =
					acc != null && (accuracy.value == null || acc + 5 < accuracy.value);

				if (dist < MIN_UPDATE_DISTANCE_KM && !accuracyImproved) {
					lastUpdated.value = Date.now();
					return;
				}
			}

			userLocation.value = [latitude, longitude];
			accuracy.value = acc;
			heading.value = h;
			speed.value = s;
			altitude.value = alt;
			lastUpdated.value = Date.now();
			isMockLocation.value = false;
			error.value = null;
			isLoading.value = false;

			if (import.meta.env.DEV) {
				console.log(
					`📍 Location updated: [${latitude.toFixed(5)}, ${longitude.toFixed(5)}] ±${acc?.toFixed(0)}m`,
				);
			}
		};

		/**
		 * Handle position error
		 */
		const handlePositionError = (err) => {
			isLoading.value = false;
			error.value = {
				code: err.code,
				message: err.message,
				type:
					err.code === 1
						? "PERMISSION_DENIED"
						: err.code === 2
							? "POSITION_UNAVAILABLE"
							: err.code === 3
								? "TIMEOUT"
								: "UNKNOWN",
			};

			if (err.code === 1) permissionStatus.value = "denied";
			if (import.meta.env.DEV)
				console.warn("📍 Geolocation error:", error.value);

			// Use default if no location set
			if (!userLocation.value) {
				setUserLocation(DEFAULT_LOCATION, true);
			}
		};

		/**
		 * Calculate distance from user to target
		 */
		const getDistanceFromUser = (lat, lng) => {
			const loc = userLocation.value || [
				DEFAULT_LOCATION.lat,
				DEFAULT_LOCATION.lng,
			];
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 9999;
			return calculateDistance(loc[0], loc[1], lat, lng);
		};

		/**
		 * Format distance for display
		 */
		const formatDistance = (km) => {
			if (km >= 100) return `${Math.round(km)} km`;
			if (km >= 1) return `${km.toFixed(1)} km`;
			return `${Math.round(km * 1000)} m`;
		};

		/**
		 * Use default location (Chiang Mai)
		 */
		const useDefaultLocation = () => {
			setUserLocation(DEFAULT_LOCATION, true);
		};

		return {
			// State
			userLocation,
			accuracy,
			heading,
			speed,
			altitude,
			lastUpdated,
			isTracking,
			isLoading,
			isMockLocation,
			permissionStatus,
			error,
			// Computed
			hasLocation,
			locationObject,
			isHighAccuracy,
			locationAge,
			isStale,
			// Actions
			setUserLocation,
			getCurrentPosition,
			startWatching,
			stopWatching,
			getDistanceFromUser,
			formatDistance,
			useDefaultLocation,
			normalizeLocation,
			// Constants
			DEFAULT_LOCATION,
		};
	},
	{
		persist: {
			paths: ["userLocation", "isMockLocation"],
			key: "vibe-location",
		},
	},
);
