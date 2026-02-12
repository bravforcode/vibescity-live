import { ref } from "vue";

export function useMapNavigation(map) {
	const roadDistance = ref(null);
	const roadDuration = ref(null);

	const flyToLocation = (lngLat, zoom = 17, pitch = 60) => {
		if (!map.value) return;
		map.value.flyTo({
			center: lngLat,
			zoom,
			pitch,
			essential: true,
			duration: 2000,
		});
	};

	const fetchRoute = async (start, end, token) => {
		if (!map.value || !start || !end) return;

		const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[1]},${start[0]};${end[1]},${end[0]}?geometries=geojson&access_token=${token}`;

		try {
			const res = await fetch(url);
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
