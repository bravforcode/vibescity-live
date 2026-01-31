
// ✅ Map Initialization (Composables)
onMounted(() => {
    if (mapContainer.value) {
        console.log("🗺️ Initializing Mapbox Core...");
        initMap(center.value, zoom.value, props.isDarkMode ? DARK_STYLE : LIGHT_STYLE);
    }
});

// ✅ Watch for Map Ready
watch(isMapReady, (ready) => {
    if (ready && map.value) {
        console.log("✅ Map Core Ready - Setting up Layers");

        // Setup Layers & Sources
        setupMapLayers();

        // Setup Interactions (Click handlers etc)
        setupMapInteractions();

        // Initial Data Sync
        updateMapSources();
        requestUpdateMarkers();
        updateEventMarkers();

        // Fade In
        setTimeout(() => {
            mapLoaded.value = true;
        }, 300);
    }
});
