import { onMounted, onUnmounted, ref, watch } from "vue";

const IS_E2E = import.meta.env.VITE_E2E === "true";
const TTL_MS = 15 * 60 * 1000;
const STORAGE_KEY = "vibecity_weather_cache_v1";

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (a, b) => {
	const R = 6371;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const sinDLat = Math.sin(dLat / 2);
	const sinDLng = Math.sin(dLng / 2);
	const h =
		sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const round2 = (n) => Math.round(n * 100) / 100;

const mapCondition = (mainRaw) => {
	const main = String(mainRaw || "").toLowerCase();
	if (main === "thunderstorm") return "storm";
	if (main === "rain" || main === "drizzle") return "rain";
	if (main === "clouds") return "clouds";
	if (main === "clear") return "clear";
	if (main) return "clouds";
	return "clear";
};

const normalizeCenter = (center) => {
	if (!center) return null;
	const lat = Number(center.lat);
	const lng = Number(center.lng);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
};

const readCache = () => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		if (!Number.isFinite(parsed.expiresAt)) return null;
		return parsed;
	} catch {
		return null;
	}
};

const writeCache = (payload) => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// ignore
	}
};

/**
 * Fetch OpenWeather current weather with privacy-preserving coords and strong caching.
 *
 * Inputs:
 * - getMapCenter(): () => ({ lng, lat })
 * - OR center: a reactive ref/computed resolving to { lng, lat }
 */
export function useWeather(options = {}) {
	const weatherCondition = ref("clear");
	const isNight = ref(false);

	if (IS_E2E) {
		return {
			weatherCondition,
			isNight,
			refresh: () => {},
		};
	}

	const keyRaw = import.meta.env.VITE_OPENWEATHER_KEY;
	const apiKey =
		typeof keyRaw === "string" ? keyRaw.trim().replace(/^['"]|['"]$/g, "") : "";

	const centerRef = options.center;
	const getMapCenter = options.getMapCenter;

	let abortController = null;
	let disposed = false;

	const resolveCenter = () => {
		if (typeof getMapCenter === "function")
			return normalizeCenter(getMapCenter());
		if (centerRef && typeof centerRef === "object" && "value" in centerRef)
			return normalizeCenter(centerRef.value);
		return normalizeCenter(centerRef);
	};

	const applyFromCache = (cached) => {
		if (!cached) return;
		if (!cached.ok) {
			weatherCondition.value = "clear";
			isNight.value = false;
			return;
		}
		const condition = cached.condition;
		weatherCondition.value =
			condition === "clear" ||
			condition === "rain" ||
			condition === "clouds" ||
			condition === "storm"
				? condition
				: "clear";
		isNight.value = Boolean(cached.isNight);
	};

	const maybeFetch = async () => {
		if (disposed) return;
		if (!apiKey) {
			weatherCondition.value = "clear";
			isNight.value = false;
			return;
		}

		const center = resolveCenter();
		if (!center) return;

		const cached = readCache();
		const now = Date.now();
		applyFromCache(cached);

		const cacheExpired = !cached || now >= Number(cached.expiresAt);
		const lastCenter = normalizeCenter(cached?.center);
		const movedKm = lastCenter ? haversineKm(lastCenter, center) : Infinity;

		// Refetch only when BOTH cache expired and center moved > 2km.
		if (!cacheExpired || movedKm <= 2) return;

		const rounded = { lat: round2(center.lat), lng: round2(center.lng) };

		if (abortController) abortController.abort();
		abortController = new AbortController();

		try {
			const url = new URL("https://api.openweathermap.org/data/2.5/weather");
			url.searchParams.set("lat", String(rounded.lat));
			url.searchParams.set("lon", String(rounded.lng));
			url.searchParams.set("appid", apiKey);
			url.searchParams.set("units", "metric");

			const res = await fetch(url.toString(), {
				signal: abortController.signal,
			});
			if (!res.ok) {
				writeCache({
					ok: false,
					fetchedAt: now,
					expiresAt: now + TTL_MS,
					center,
					rounded,
					error: { status: res.status },
				});
				weatherCondition.value = "clear";
				isNight.value = false;
				return;
			}

			const data = await res.json();
			const condition = mapCondition(data?.weather?.[0]?.main);
			const dt = Number(data?.dt);
			const sunrise = Number(data?.sys?.sunrise);
			const sunset = Number(data?.sys?.sunset);
			const night =
				Number.isFinite(dt) &&
				Number.isFinite(sunrise) &&
				Number.isFinite(sunset)
					? dt < sunrise || dt > sunset
					: false;

			writeCache({
				ok: true,
				fetchedAt: now,
				expiresAt: now + TTL_MS,
				center,
				rounded,
				condition,
				isNight: night,
			});

			weatherCondition.value = condition;
			isNight.value = night;
		} catch (err) {
			if (err?.name === "AbortError") return;
			writeCache({
				ok: false,
				fetchedAt: now,
				expiresAt: now + TTL_MS,
				center,
				error: { name: err?.name || "Error" },
			});
			weatherCondition.value = "clear";
			isNight.value = false;
		}
	};

	const refresh = () => {
		void maybeFetch();
	};

	onMounted(() => {
		applyFromCache(readCache());
		void maybeFetch();
	});

	if (centerRef && typeof centerRef === "object" && "value" in centerRef) {
		watch(
			centerRef,
			() => {
				void maybeFetch();
			},
			{ deep: false },
		);
	}

	onUnmounted(() => {
		disposed = true;
		if (abortController) abortController.abort();
		abortController = null;
	});

	return { weatherCondition, isNight, refresh };
}
