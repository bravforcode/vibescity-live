import { triggerParticleBurst } from "../../utils/particleEffects";
import { useHaptics } from "../useHaptics";

export function useMapInteractions(
	map,
	_isMapReady,
	emit,
	props,
	mapContainerRef,
	options = {},
) {
	const { impactFeedback } = useHaptics();
	const { spawnTapRipple } = options;
	const PIN_LAYER_ID = "vibe-pins-layer";
	const CLUSTER_LAYER_ID = "vibe-clusters-layer";
	const PIN_SOURCE_ID = "vibe-shops";

	const handlePointClick = (e) => {
		if (!e.features?.[0]) return;

		// Vibe Pop Visual
		if (mapContainerRef?.value) {
			const { x, y } = e.point;
			const rect = mapContainerRef.value.getBoundingClientRect();
			const px = (x + rect.left) / window.innerWidth;
			const py = (y + rect.top) / window.innerHeight;
			triggerParticleBurst(
				px,
				py,
				e.features[0].properties.pin_type === "giant" ? "love" : "vibe",
			);
		}

		const feature = e.features[0];
		const shopData = { ...feature.properties };
		const pulseColor =
			shopData.pin_type === "giant"
				? "#a855f7"
				: shopData.boost
					? "#ef4444"
					: "#60a5fa";

		// Trigger Ripple directly if function provided
		if (typeof spawnTapRipple === "function") {
			spawnTapRipple(feature.geometry.coordinates, pulseColor);
		} else {
			emit("interaction-ripple", {
				coords: feature.geometry.coordinates,
				color: pulseColor,
			});
		}

		impactFeedback("light");

		// Ensure numeric coords
		shopData.lat = Number(feature.geometry.coordinates[1]);
		shopData.lng = Number(feature.geometry.coordinates[0]);

		emit("select-shop", shopData);
		flyTo({
			center: [shopData.lng, shopData.lat],
			zoom: 16,
			essential: true,
		});
	};

	const handleClusterClick = (e) => {
		if (!map.value) return;
		const features = map.value.queryRenderedFeatures(e.point, {
			layers: [CLUSTER_LAYER_ID],
		});
		const cluster = features?.[0];
		if (!cluster) return;
		impactFeedback("medium");

		if (typeof spawnTapRipple === "function") {
			spawnTapRipple(cluster.geometry.coordinates, "#a78bfa");
		} else {
			emit("interaction-ripple", {
				coords: cluster.geometry.coordinates,
				color: "#a78bfa",
			});
		}

		const clusterId = cluster.properties?.cluster_id;
		const source =
			map.value.getSource(PIN_SOURCE_ID) ??
			map.value.getSource("vibe-shops-regular");

		if (!source?.getClusterExpansionZoom) return;
		source.getClusterExpansionZoom(clusterId, (err, zoom) => {
			if (err) return;
			map.value.easeTo({
				center: cluster.geometry.coordinates,
				zoom: zoom,
			});
		});
	};

	const handleMarkerClick = (item) => {
		if (!item) return;
		emit("select-shop", item);
		// showPopup is handled by parent watcher on selectedShop usually,
		// or we can emit 'show-popup'
		emit("show-popup", item);
	};

	const setPointer = () => {
		if (map.value) map.value.getCanvas().style.cursor = "pointer";
	};

	const resetPointer = () => {
		if (map.value) map.value.getCanvas().style.cursor = "";
	};

	const setupMapInteractions = () => {
		if (!map.value) return;

		const safeBind = (event, layerId, handler) => {
			if (!map.value.getLayer(layerId)) return;
			map.value.off(event, layerId, handler);
			map.value.on(event, layerId, handler);
		};

		// Pins
		safeBind("click", PIN_LAYER_ID, handlePointClick);
		safeBind("mouseenter", PIN_LAYER_ID, setPointer);
		safeBind("mouseleave", PIN_LAYER_ID, resetPointer);

		// Clusters
		safeBind("click", CLUSTER_LAYER_ID, handleClusterClick);
		safeBind("mouseenter", CLUSTER_LAYER_ID, setPointer);
		safeBind("mouseleave", CLUSTER_LAYER_ID, resetPointer);
	};

	// --- FlyTo / Focus Logic ---

	const focusLocation = (
		coords,
		targetZoom = 17,
		pitch = 50,
		extraBottomOffset = 0,
	) => {
		if (!map.value || !coords) return;

		// Calculate dynamic padding based on UI offsets
		const padding = {
			top: (props.uiTopOffset || 0) + 50,
			bottom:
				(props.uiBottomOffset || 0) +
				(props.isSidebarOpen ? 20 : 180) +
				extraBottomOffset,
			left: props.isSidebarOpen ? 300 : 20,
			right: 20,
		};

		map.value.flyTo({
			center: coords,
			zoom: targetZoom,
			pitch: pitch ?? 50,
			bearing: 0,
			padding,
			speed: 0.6,
			curve: 1.1,
			essential: true,
		});

		// Parent should handle "addHeatmapLayer" if needed,
		// or we expose a callback/hook
	};

	const centerOnUser = () => {
		if (props.userLocation && props.userLocation.length >= 2) {
			// [lat, lng] -> [lng, lat]
			const lngLat = [props.userLocation[1], props.userLocation[0]];
			focusLocation(lngLat, 17);
		}
	};

	const flyTo = (arg1, arg2) => {
		if (!map.value) return;
		if (typeof arg1 === "object" && !Array.isArray(arg1)) {
			map.value.flyTo(arg1);
		} else {
			map.value.flyTo({ center: arg1, zoom: arg2, essential: true });
		}
	};

	return {
		handlePointClick,
		handleClusterClick,
		handleMarkerClick,
		setupMapInteractions,
		focusLocation,
		centerOnUser,
		flyTo,
	};
}
