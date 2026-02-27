import { ref } from "vue";
import { apiFetch } from "../../services/apiClient";

export function useMapNavigation(map) {
	const roadDistance = ref(null);
	const roadDuration = ref(null);

	const flyToLocation = (lngLat, zoom = 17, pitch = 60) => {
		if (!map.value) return;
		const currentZoom = map.value.getZoom();
		// Cinematic fly-to: ease-out curve with gentle bearing shift
		map.value.flyTo({
			center: lngLat,
			zoom,
			pitch,
			bearing: map.value.getBearing(), // keep current bearing for smooth feel
			essential: true,
			duration: Math.min(
				3000,
				Math.max(1400, Math.abs(currentZoom - zoom) * 400),
			),
			curve: 1.42, // zoom-out-then-in arc (> 1 = more dramatic)
			easing: (t) => 1 - (1 - t) ** 3, // ease-out cubic
			padding: { bottom: 200 }, // Default padding offset for nav flyTo
		});
	};

	const fetchRoute = async (start, end, token) => {
		if (!map.value || !start || !end) return;

		try {
			const params = new URLSearchParams({
				start_lat: String(start[0]),
				start_lng: String(start[1]),
				end_lat: String(end[0]),
				end_lng: String(end[1]),
				profile: "walking",
				geometries: "geojson",
			});
			const res = await apiFetch(
				`/proxy/mapbox-directions?${params.toString()}`,
				{
					includeVisitor: false,
					headers: { "X-Mapbox-Token": String(token || "") },
				},
			);
			if (!res.ok) return;
			const data = await res.json();

			if (data.routes?.[0]) {
				const route = data.routes[0];
				roadDistance.value = route.distance;
				roadDuration.value = route.duration;

				// Update Source
				if (map.value.getSource("distance-line")) {
					map.value.getSource("distance-line").setData({
						type: "Feature",
						geometry: route.geometry,
					});
				}
			}
		} catch (e) {
			console.error("Route fetch failed", e);
		}
	};

	return {
		flyToLocation,
		fetchRoute,
		roadDistance,
		roadDuration,
	};
}
