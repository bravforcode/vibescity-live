import { defineStore } from "pinia";
import { ref } from "vue";

export const NEON_NEARBY_LIMIT = 30;
export const NEON_MAX_RADIUS_KM = 20;
// Replace 1 sign per minute → full 30-sign rotation completes in 30 minutes
const ROTATION_INTERVAL_MS = 60 * 1000;
const FADE_DURATION_MS = 700;

const _haversineKm = (lat1, lng1, lat2, lng2) => {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const useNeonRotationStore = defineStore("neonRotation", () => {
	// IDs of signs currently on the map
	const selectedIds = ref(new Set());
	// ID currently fading out (opacity 1→0, kept in source until fade ends)
	const fadingOutId = ref(null);
	// ID currently fading in (in source, opacity 0→1)
	const fadingInId = ref(null);
	// Incremented each time the selection changes → triggers map source update
	const generation = ref(0);

	let _pool = []; // candidate array (≤150, distance-sorted)
	let _rotTimer = null;
	const _fadeTimers = [];

	// Build candidate pool: ≤150 nearest shops within NEON_MAX_RADIUS_KM
	const setPool = (allFeatures, userLocation) => {
		const lat = Array.isArray(userLocation) ? Number(userLocation[0]) : NaN;
		const lng = Array.isArray(userLocation) ? Number(userLocation[1]) : NaN;
		const hasGps = Number.isFinite(lat) && Number.isFinite(lng);

		let shops = (allFeatures || []).filter(
			(f) => f?.properties?.pin_type !== "giant",
		);

		if (hasGps) {
			shops = shops
				.map((f) => ({
					f,
					d: _haversineKm(
						lat,
						lng,
						Number(f?.geometry?.coordinates?.[1]),
						Number(f?.geometry?.coordinates?.[0]),
					),
				}))
				.filter(
					(item) => Number.isFinite(item.d) && item.d <= NEON_MAX_RADIUS_KM,
				)
				.sort((a, b) => a.d - b.d)
				.slice(0, 150)
				.map((item) => item.f);
		} else {
			shops = shops.slice(0, 150);
		}

		_pool = shops;

		// Seed initial selection
		if (selectedIds.value.size === 0) {
			selectedIds.value = new Set(
				shops
					.slice(0, NEON_NEARBY_LIMIT)
					.map((f) => String(f?.properties?.id || ""))
					.filter(Boolean),
			);
			generation.value++;
			return;
		}

		// Prune IDs no longer in pool, then fill vacancies
		const poolIds = new Set(shops.map((f) => String(f?.properties?.id || "")));
		const next = new Set(
			[...selectedIds.value].filter((id) => poolIds.has(id)),
		);
		for (const f of shops) {
			if (next.size >= NEON_NEARBY_LIMIT) break;
			const id = String(f?.properties?.id || "");
			if (id && !next.has(id)) next.add(id);
		}
		if (next.size !== selectedIds.value.size) {
			selectedIds.value = next;
			generation.value++;
		}
	};

	// Filter features to render: selected 30 + currently-fading-out sign
	const filterForMap = (features) => {
		if (!Array.isArray(features)) return features;
		const aggregates = features.filter(
			(f) => f?.properties?.pin_type === "giant",
		);
		const shops = features.filter((f) => {
			if (f?.properties?.pin_type === "giant") return false;
			const id = String(f?.properties?.id || "");
			return id && (selectedIds.value.has(id) || id === fadingOutId.value);
		});
		return [...aggregates, ...shops];
	};

	// Return only features in the current candidate pool (for sprite pre-warm)
	const getCandidateFeatures = (allFeatures) => {
		if (!Array.isArray(allFeatures)) return allFeatures;
		const poolIds = new Set(_pool.map((f) => String(f?.properties?.id || "")));
		const aggregates = allFeatures.filter(
			(f) => f?.properties?.pin_type === "giant",
		);
		const candidates = allFeatures.filter((f) => {
			if (f?.properties?.pin_type === "giant") return false;
			const id = String(f?.properties?.id || "");
			return id && poolIds.has(id);
		});
		return [...aggregates, ...candidates];
	};

	// Swap one sign: fade out the oldest selected, fade in the nearest unselected
	const _rotateOne = () => {
		if (fadingOutId.value || fadingInId.value) return; // busy
		const unselected = _pool.filter((f) => {
			const id = String(f?.properties?.id || "");
			return id && !selectedIds.value.has(id);
		});
		if (!unselected.length) return;

		const outId = [...selectedIds.value][0]; // oldest (FIFO)
		if (!outId) return;
		const inId = String(unselected[0]?.properties?.id || ""); // nearest
		if (!inId) return;

		// Phase 1: signal fade-out → MapboxContainer sets feature-state neon_opacity→0
		fadingOutId.value = outId;

		// Phase 2: after fade-out, swap IDs and signal fade-in
		const t1 = setTimeout(() => {
			const next = new Set(selectedIds.value);
			next.delete(outId);
			next.add(inId);
			selectedIds.value = next;
			fadingOutId.value = null;
			fadingInId.value = inId;
			generation.value++;

			// Phase 3: clear fade-in marker after animation
			const t2 = setTimeout(() => {
				fadingInId.value = null;
			}, FADE_DURATION_MS + 100);
			_fadeTimers.push(t2);
		}, FADE_DURATION_MS);
		_fadeTimers.push(t1);
	};

	const startRotation = () => {
		if (_rotTimer) return;
		_rotTimer = setInterval(_rotateOne, ROTATION_INTERVAL_MS);
	};

	const stopRotation = () => {
		clearInterval(_rotTimer);
		_rotTimer = null;
		_fadeTimers.forEach(clearTimeout);
		_fadeTimers.length = 0;
		fadingOutId.value = null;
		fadingInId.value = null;
	};

	return {
		selectedIds,
		fadingOutId,
		fadingInId,
		generation,
		setPool,
		filterForMap,
		getCandidateFeatures,
		startRotation,
		stopRotation,
	};
});
