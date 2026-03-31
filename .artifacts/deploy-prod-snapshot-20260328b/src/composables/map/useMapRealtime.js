import { computed, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";

export function useMapRealtime(
	mapRef,
	isMapReadyRef,
	isPerfRestrictedRef,
	effectiveMotionBudgetRef,
	highlightedShopIdRef,
	shopsRef,
) {
	const hotspotSnapshot = ref([]);
	const liveVenueRefs = ref(new Set());
	const tapRipplesData = ref({ type: "FeatureCollection", features: [] });

	// Constants
	const PIN_SOURCE_ID = "pins_source";
	const PIN_LAYER_ID = "unclustered-pins";

	// Smart Pulse State
	let smartPulseTimer = null;
	let pulsePhase = 0;
	const smartPulseTargets = ref(new Set());
	const currentPulseAppliedIds = ref(new Set());
	let tapRippleSeed = 0;

	// Helpers
	const toFeatureStateId = (id) => {
		if (id === null || id === undefined) return null;
		const str = String(id);
		if (/^\d+$/.test(str)) return Number(str);
		return str;
	};

	const getSmartPulseFps = () => {
		const budget = effectiveMotionBudgetRef?.value;
		if (budget === "full") return 8;
		if (budget === "balanced") return 6;
		return 4;
	};

	// i18n
	const { t } = useI18n();

	// Live Chips
	const liveActivityChips = computed(() => {
		const rows = Array.isArray(hotspotSnapshot.value)
			? hotspotSnapshot.value
			: [];
		if (!rows.length) return [];

		const byScore = [...rows].sort(
			(a, b) => Number(b.score || 0) - Number(a.score || 0),
		);
		const hottest = byScore[0];
		const fastest = [...rows].sort(
			(a, b) => Number(b.event_count || 0) - Number(a.event_count || 0),
		)[0];
		const crowded = [...rows].sort(
			(a, b) => Number(b.unique_visitors || 0) - Number(a.unique_visitors || 0),
		)[0];

		const chips = [];
		if (hottest) {
			chips.push({
				id: "hot",
				label: t("map.realtime.hot"),
				value: hottest.event_count || 0,
				tone: "hot",
			});
		}
		if (fastest) {
			chips.push({
				id: "surge",
				label: t("map.realtime.surge"),
				value: fastest.unique_visitors || 0,
				tone: "surge",
			});
		}
		if (crowded) {
			chips.push({
				id: "zone",
				label: t("map.realtime.zone"),
				value: crowded.score || 0,
				tone: "zone",
			});
		}
		return chips.slice(0, 3);
	});

	const syncLiveFlagsToPinSource = () => {
		const source = mapRef.value?.getSource(PIN_SOURCE_ID);
		const data = source?._data;
		if (!data?.features?.length) return;
		data.features = data.features.map((feature) => {
			const id = String(feature?.properties?.id ?? feature?.id ?? "");
			return {
				...feature,
				properties: {
					...(feature.properties || {}),
					is_live: liveVenueRefs.value.has(id),
				},
			};
		});
		source.setData(data);
	};

	const stopSmartPulseLoop = (reset = true) => {
		if (smartPulseTimer) {
			clearInterval(smartPulseTimer);
			smartPulseTimer = null;
		}
		if (!reset || !mapRef.value) return;
		currentPulseAppliedIds.value.forEach((id) => {
			const featureId = toFeatureStateId(id);
			if (featureId === null) return;
			mapRef.value.setFeatureState(
				{ source: PIN_SOURCE_ID, id: featureId },
				{ pulse: 0, selected: false, boost: false, live: false },
			);
		});
		currentPulseAppliedIds.value = new Set();
	};

	const refreshSmartPulseTargets = () => {
		if (!mapRef.value || !isMapReadyRef.value || isPerfRestrictedRef.value) {
			smartPulseTargets.value = new Set();
			stopSmartPulseLoop();
			return;
		}

		const source = mapRef.value.getSource(PIN_SOURCE_ID);
		const data = source?._data;
		if (!data?.features?.length) {
			smartPulseTargets.value = new Set();
			stopSmartPulseLoop();
			return;
		}

		const selectedId = highlightedShopIdRef.value
			? String(highlightedShopIdRef.value)
			: null;
		const nextTargets = new Set();
		const states = new Map();

		data.features.forEach((feature) => {
			const propsData = feature?.properties || {};
			const id = String(propsData.id ?? feature.id ?? "");
			if (!id) return;

			const isSelected = selectedId ? id === selectedId : false;
			const isBoost = Boolean(propsData.boost);
			const isLive = liveVenueRefs.value.has(id) || Boolean(propsData.is_live);

			const motion = effectiveMotionBudgetRef.value;
			const shouldPulse =
				isSelected ||
				(motion !== "micro" && (isBoost || isLive)) ||
				(motion === "micro" && isLive);

			if (!shouldPulse) return;

			nextTargets.add(id);
			states.set(id, { selected: isSelected, boost: isBoost, live: isLive });
		});

		const mergedIds = new Set([
			...Array.from(currentPulseAppliedIds.value),
			...Array.from(nextTargets),
		]);
		mergedIds.forEach((id) => {
			const featureId = toFeatureStateId(id);
			if (featureId === null) return;
			const state = states.get(id) || {
				selected: false,
				boost: false,
				live: false,
			};
			mapRef.value.setFeatureState(
				{ source: PIN_SOURCE_ID, id: featureId },
				state,
			);
		});

		smartPulseTargets.value = nextTargets;
		currentPulseAppliedIds.value = nextTargets;

		if (!nextTargets.size) {
			stopSmartPulseLoop();
			return;
		}

		if (!smartPulseTimer) {
			const interval = Math.max(120, Math.round(1000 / getSmartPulseFps()));
			smartPulseTimer = setInterval(() => {
				if (!mapRef.value || document.hidden || isPerfRestrictedRef.value)
					return;
				pulsePhase += 0.45;
				const pulse = (Math.sin(pulsePhase) + 1) / 2;
				smartPulseTargets.value.forEach((id) => {
					const featureId = toFeatureStateId(id);
					if (featureId === null) return;
					mapRef.value.setFeatureState(
						{ source: PIN_SOURCE_ID, id: featureId },
						{ pulse },
					);
				});
			}, interval);
		}
	};

	const consumeHotspotUpdate = (rows) => {
		if (!Array.isArray(rows)) return;
		hotspotSnapshot.value = rows;
		const nextLive = new Set();
		rows.forEach((row) => {
			const venueRef = row?.venue_ref ?? row?.shop_id ?? row?.venue_id;
			if (!venueRef) return;
			if (Number(row?.event_count || 0) > 0 || Number(row?.score || 0) > 0) {
				nextLive.add(String(venueRef));
			}
		});
		liveVenueRefs.value = nextLive;
		syncLiveFlagsToPinSource();
		refreshSmartPulseTargets();
	};

	const ensureTapRippleLayer = () => {
		if (!mapRef.value) return;
		if (!mapRef.value.isStyleLoaded?.()) return;
		if (!mapRef.value.getSource("tap-ripples")) {
			mapRef.value.addSource("tap-ripples", {
				type: "geojson",
				data: tapRipplesData.value,
			});
		}
		if (!mapRef.value.getLayer("tap-ripples-layer")) {
			try {
				mapRef.value.addLayer(
					{
						id: "tap-ripples-layer",
						type: "circle",
						source: "tap-ripples",
						paint: {
							"circle-radius": ["coalesce", ["get", "radius"], 8],
							"circle-color": ["coalesce", ["get", "color"], "#60a5fa"],
							"circle-opacity": ["coalesce", ["get", "opacity"], 0],
							"circle-blur": 0.85,
						},
					},
					PIN_LAYER_ID,
				);
			} catch (e) {
				console.warn("Tap ripple layer add failed", e);
			}
		}
	};

	const setTapRipplesSource = () => {
		const source = mapRef.value?.getSource("tap-ripples");
		if (source) {
			source.setData(tapRipplesData.value);
		}
	};

	const spawnTapRipple = (coords, color = "#60a5fa") => {
		if (!mapRef.value || !isMapReadyRef.value || !Array.isArray(coords)) return;
		ensureTapRippleLayer();
		const id = `ripple-${Date.now()}-${tapRippleSeed++}`;
		const durationMs = 600 + Math.round(Math.random() * 300);

		tapRipplesData.value.features.push({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: coords,
			},
			properties: {
				id,
				radius: 4,
				opacity: 0.45,
				color,
			},
		});
		setTapRipplesSource();

		requestAnimationFrame(() => {
			tapRipplesData.value.features = tapRipplesData.value.features.map((f) =>
				f.properties?.id === id
					? {
							...f,
							properties: {
								...f.properties,
								radius: 26,
								opacity: 0,
							},
						}
					: f,
			);
			setTapRipplesSource();
		});

		setTimeout(() => {
			tapRipplesData.value.features = tapRipplesData.value.features.filter(
				(f) => f.properties?.id !== id,
			);
			setTapRipplesSource();
		}, durationMs);
	};

	const extractEffectCoords = (effect) => {
		const payload = effect?.payload || {};
		if (Array.isArray(payload.coords) && payload.coords.length === 2) {
			return [Number(payload.coords[0]), Number(payload.coords[1])];
		}
		if (Number.isFinite(payload.lng) && Number.isFinite(payload.lat)) {
			return [Number(payload.lng), Number(payload.lat)];
		}
		const venueRef = String(effect?.venue_ref ?? payload?.venue_ref ?? "");
		if (!venueRef) return null;
		const fromShop = shopsRef.value?.find((s) => String(s.id) === venueRef);
		if (fromShop?.lng && fromShop?.lat) {
			return [Number(fromShop.lng), Number(fromShop.lat)];
		}
		return null;
	};

	const consumeMapEffects = (events) => {
		if (!Array.isArray(events) || !events.length) return;
		events.forEach((effect) => {
			const coords = extractEffectCoords(effect);
			if (!coords) return;
			const effectType = String(effect?.effect_type || "");
			if (effectType === "tap_ripple" || effectType === "boost_burst") {
				spawnTapRipple(
					coords,
					effectType === "boost_burst" ? "#f97316" : "#60a5fa",
				);
			} else {
				spawnTapRipple(coords);
			}
		});
	};

	onUnmounted(() => {
		stopSmartPulseLoop();
	});

	return {
		hotspotSnapshot,
		liveVenueRefs,
		tapRipplesData,
		liveActivityChips,
		consumeHotspotUpdate,
		spawnTapRipple,
		ensureTapRippleLayer,
		consumeMapEffects,
		refreshSmartPulseTargets,
		stopSmartPulseLoop,
	};
}
