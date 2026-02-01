import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { onUnmounted, ref, shallowRef } from 'vue';

export function useMapCore(containerRef, _options = {}) {
    const map = shallowRef(null);
    const isMapReady = ref(false);
    const isMapLoaded = ref(false);

    // Default Access Token (should be in env, but keeping logic consistent)
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWVudW0iLCJhIjoiY2xrbnJ...'; // Fallback if needed

    const initMap = (initialCenter = [98.968, 18.7985], initialZoom = 15, style = 'mapbox://styles/mapbox/dark-v11') => {
        if (!containerRef.value) return;

        map.value = new mapboxgl.Map({
            container: containerRef.value,
            style: style,
            center: initialCenter,
            zoom: initialZoom,
            pitch: 45, // Default pitch for 3D feel
            bearing: 0,
            antialias: true,
            attributionControl: false,
        });

        // Add Controls
        map.value.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
        map.value.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: false }), 'top-right');

        map.value.on('load', () => {
            isMapReady.value = true;
            isMapLoaded.value = true;
            if (map.value) {
                map.value.resize(); // Ensure correct size
            }
        });

        // Error handling
        map.value.on('error', (e) => {
            console.error("Mapbox Error:", e);
        });
    };

    const setMapStyle = (styleUrl) => {
        if (map.value) {
            map.value.setStyle(styleUrl);
            // Note: Sources/Layers need re-adding after style change.
            // This event should be handled by consumers.
        }
    };

    onUnmounted(() => {
        if (map.value) {
            map.value.remove();
            map.value = null;
        }
    });

    return {
        map,
        isMapReady,
        isMapLoaded,
        initMap,
        setMapStyle
    };
}
