
export function useMapLayers(map) {

    // --- Sources & Layers Definitions ---

    const addNeonRoads = () => {
        if (!map.value) return;
        if (map.value.getSource('neon-roads')) return;

        try {
            map.value.addSource("neon-roads", {
                type: "geojson",
                data: "/data/chiangmai-main-roads-lanes.geojson",
            });
            map.value.addLayer({
                id: "neon-roads-outer",
                type: "line",
                source: "neon-roads",
                paint: {
                    "line-color": "#06b6d4",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 4],
                    "line-opacity": 0.15,
                    "line-blur": 5,
                },
            });
            map.value.addLayer({
                id: "neon-roads-inner",
                type: "line",
                source: "neon-roads",
                paint: {
                    "line-color": "#22d3ee",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.5],
                    "line-opacity": 0.6,
                },
            });
        } catch (e) {
            console.warn("Neon roads setup failed:", e);
        }
    };

    const addClusters = (sourceId, sourceData) => {
        if (!map.value) return;
        if (map.value.getSource(sourceId)) {
             map.value.getSource(sourceId).setData(sourceData);
             return;
        }

        map.value.addSource(sourceId, {
            type: "geojson",
            data: sourceData,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
        });

        map.value.addLayer({
            id: "clusters",
            type: "circle",
            source: sourceId,
            filter: ["has", "point_count"],
            paint: {
                "circle-color": [
                    "step", ["get", "point_count"],
                    "#60a5fa", 10, "#a855f7", 30, "#ec4899"
                ],
                "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff",
                "circle-opacity": 0.8,
            },
        });

        map.value.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: sourceId,
            filter: ["has", "point_count"],
            layout: {
                "text-field": "{point_count_abbreviated}",
                "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
        });
    };

    // Public API
    return {
        addNeonRoads,
        addClusters
    };
}
