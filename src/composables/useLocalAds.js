import { computed, onUnmounted, ref, watch } from "vue";
import { isSupabaseSchemaCacheError } from "@/lib/supabase";
import { localAdService } from "@/services/localAdService";
import { useLocationStore } from "@/store/locationStore";

const MOVEMENT_THRESHOLD_KM = 0.5; // re-fetch when user moves 500 m
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // also refresh every 5 min

/**
 * Composable that loads geofenced ads for the current user position.
 */
export function useLocalAds() {
	const isE2E =
		import.meta.env.VITE_E2E === "true" ||
		import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
		import.meta.env.MODE === "e2e";
	const locationStore = useLocationStore();
	const coords = computed(() => locationStore.locationObject);

	const ads = ref([]);
	const loading = ref(false);
	const error = ref(null);
	const dismissed = ref(new Set());

	let lastFetchCoords = null;
	let refreshTimer = null;

	const visibleAds = computed(() =>
		ads.value.filter((ad) => !dismissed.value.has(ad.id)),
	);

	/* ---------- helpers ---------- */

	function haversineKm(a, b) {
		const R = 6371;
		const dLat = ((b.lat - a.lat) * Math.PI) / 180;
		const dLng = ((b.lng - a.lng) * Math.PI) / 180;
		const sinLat = Math.sin(dLat / 2);
		const sinLng = Math.sin(dLng / 2);
		const h =
			sinLat * sinLat +
			Math.cos((a.lat * Math.PI) / 180) *
				Math.cos((b.lat * Math.PI) / 180) *
				sinLng *
				sinLng;
		return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
	}

	async function fetchAds() {
		if (isE2E) {
			ads.value = [];
			return;
		}
		if (!coords.value) return;
		const { lat, lng } = coords.value;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
		loading.value = true;
		error.value = null;
		try {
			const result = await localAdService.getByLocation(lat, lng);
			ads.value = result;
			lastFetchCoords = { lat, lng };
		} catch (e) {
			if (isSupabaseSchemaCacheError(e)) {
				if (import.meta.env.DEV) {
					console.warn(
						"[useLocalAds] schema cache unavailable, keeping previous ads",
					);
				}
				error.value = null;
				return;
			}
			if (import.meta.env.DEV) {
				console.warn("[useLocalAds] fetch failed", e?.message || e);
			}
			error.value = e.message || "Failed to load ads";
		} finally {
			loading.value = false;
		}
	}

	function dismissAd(id) {
		dismissed.value = new Set([...dismissed.value, id]);
	}

	/* ---------- reactivity ---------- */

	watch(
		coords,
		(newC) => {
			if (!newC) return;
			if (!Number.isFinite(newC.lat) || !Number.isFinite(newC.lng)) return;
			const pos = { lat: newC.lat, lng: newC.lng };
			if (
				!lastFetchCoords ||
				haversineKm(lastFetchCoords, pos) >= MOVEMENT_THRESHOLD_KM
			) {
				fetchAds();
			}
		},
		{ immediate: true },
	);

	if (!isE2E) {
		refreshTimer = setInterval(fetchAds, REFRESH_INTERVAL_MS);
	}

	onUnmounted(() => {
		if (refreshTimer) clearInterval(refreshTimer);
	});

	return {
		ads,
		visibleAds,
		loading,
		error,
		dismissAd,
		fetchAds,
	};
}
