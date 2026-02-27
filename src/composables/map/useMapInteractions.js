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
	const resolveFeatureItem =
		typeof options.resolveFeatureItem === "function"
			? options.resolveFeatureItem
			: null;
	const enableTapRipple = options.enableTapRipple !== false;
	const PIN_LAYER_ID = options.pinLayerId || "unclustered-pins";
	const PIN_HITBOX_LAYER_ID =
		options.pinHitboxLayerId || "unclustered-pins-hitbox";
	const CLUSTER_LAYER_ID = options.clusterLayerId || "clusters";
	const PIN_SOURCE_ID = options.pinSourceId || "pins_source";
	let lastPointClickSignature = "";
	let lastPointClickAt = 0;

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

		// Trigger ripple only when enabled.
		if (enableTapRipple) {
			if (typeof spawnTapRipple === "function") {
				spawnTapRipple(feature.geometry.coordinates, pulseColor);
			} else {
				emit("interaction-ripple", {
					coords: feature.geometry.coordinates,
					color: pulseColor,
				});
			}
		}

		impactFeedback("light");

		// Ensure numeric coords
		shopData.lat = Number(feature.geometry.coordinates[1]);
		shopData.lng = Number(feature.geometry.coordinates[0]);
		const pointSig = `${String(shopData.id ?? feature.id ?? "")}:${Math.round(
			Number(e.point?.x ?? 0),
		)}:${Math.round(Number(e.point?.y ?? 0))}`;
		const now = Date.now();
		if (pointSig === lastPointClickSignature && now - lastPointClickAt < 220) {
			return;
		}
		lastPointClickSignature = pointSig;
		lastPointClickAt = now;

		const resolvedShop = resolveFeatureItem
			? resolveFeatureItem(shopData, feature)
			: shopData;
		emit("select-shop", resolvedShop || shopData);
	};

	const handleClusterClick = (e) => {
		if (!map.value) return;
		const features = map.value.queryRenderedFeatures(e.point, {
			layers: [CLUSTER_LAYER_ID],
		});
		const cluster = features?.[0];
		if (!cluster) return;
		impactFeedback("medium");

		if (enableTapRipple) {
			if (typeof spawnTapRipple === "function") {
				spawnTapRipple(cluster.geometry.coordinates, "#a78bfa");
			} else {
				emit("interaction-ripple", {
					coords: cluster.geometry.coordinates,
					color: "#a78bfa",
				});
			}
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

		const safeUnbind = (event, layerId, handler) => {
			try {
				map.value.off(event, layerId, handler);
			} catch {
				// no-op when layer/handler is not bound
			}
		};
		const safeBind = (event, layerId, handler) => {
			if (!map.value.getLayer(layerId)) return;
			map.value.off(event, layerId, handler);
			map.value.on(event, layerId, handler);
		};

		// Ensure old bindings are removed before rebinding.
		for (const layerId of [PIN_LAYER_ID, PIN_HITBOX_LAYER_ID]) {
			safeUnbind("click", layerId, handlePointClick);
			safeUnbind("mouseenter", layerId, setPointer);
			safeUnbind("mouseleave", layerId, resetPointer);
		}

		// Click is bound once to avoid duplicate open from pin + hitbox overlays.
		const clickLayer = map.value.getLayer(PIN_HITBOX_LAYER_ID)
			? PIN_HITBOX_LAYER_ID
			: map.value.getLayer(PIN_LAYER_ID)
				? PIN_LAYER_ID
				: null;
		if (clickLayer) {
			safeBind("click", clickLayer, handlePointClick);
			safeBind("mouseenter", clickLayer, setPointer);
			safeBind("mouseleave", clickLayer, resetPointer);
		}

		// Clusters
		safeBind("click", CLUSTER_LAYER_ID, handleClusterClick);
		safeBind("mouseenter", CLUSTER_LAYER_ID, setPointer);
		safeBind("mouseleave", CLUSTER_LAYER_ID, resetPointer);
	};

	// --- FlyTo / Focus Logic ---
	const focusLocation = (
		coords,
		targetZoom = 16,
		pitch = 60,
		extraBottomOffset = 0,
	) => {
		if (!map.value || !Array.isArray(coords) || coords.length < 2) return;

		const lng = Number(coords[0]);
		const lat = Number(coords[1]);
		if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

		// Calculate dynamic padding based on UI offsets
		const padding = {
			top: (props.uiTopOffset || 0) + 50,
			bottom:
				(props.uiBottomOffset || 0) +
				(props.isSidebarOpen ? 20 : 180) +
				Number(extraBottomOffset || 0),
			left: props.isSidebarOpen ? 300 : 20,
			right: 20,
		};

		map.value.flyTo({
			center: [lng, lat],
			zoom: targetZoom,
			pitch: pitch ?? 60,
			bearing: 0,
			padding,
			speed: 0.6,
			curve: 1.1,
			essential: true,
		});

		// Parent should handle "addHeatmapLayer" if needed.
	};

	const centerOnUser = () => {
		if (props.userLocation && props.userLocation.length >= 2) {
			// [lat, lng] -> [lng, lat]
			const lngLat = [props.userLocation[1], props.userLocation[0]];
			focusLocation(lngLat, 17, 60);
		}
	};

	const flyTo = (arg1, arg2) => {
		if (!map.value) return;

		const padding = {
			top: (props.uiTopOffset || 0) + 50,
			bottom: (props.uiBottomOffset || 0) + (props.isSidebarOpen ? 20 : 180),
			left: props.isSidebarOpen ? 300 : 20,
			right: 20,
		};

		if (typeof arg1 === "object" && !Array.isArray(arg1)) {
			map.value.flyTo({ padding, pitch: 60, ...arg1 });
		} else {
			map.value.flyTo({
				center: arg1,
				zoom: arg2,
				essential: true,
				padding,
				pitch: 60,
			});
		}
	};

	return {
		handlePointClick,
		handleClusterClick,
		handleMarkerClick,
		setPointer,
		resetPointer,
		setupMapInteractions,
		focusLocation,
		centerOnUser,
		flyTo,
	};
}
