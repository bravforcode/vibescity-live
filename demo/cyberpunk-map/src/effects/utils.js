// ── Layer / Source helpers with graceful fallbacks ──

export function safeAddLayer(map, layer, beforeId) {
  try {
    if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    if (beforeId && map.getLayer(beforeId)) {
      map.addLayer(layer, beforeId);
    } else {
      map.addLayer(layer);
    }
  } catch (e) {
    console.warn(`[VibeCity] addLayer "${layer.id}":`, e.message);
  }
}

export function safeRemoveLayer(map, id) {
  try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
}

export function safeAddSource(map, id, def) {
  try {
    if (!map.getSource(id)) map.addSource(id, def);
  } catch (e) {
    console.warn(`[VibeCity] addSource "${id}":`, e.message);
  }
}

export function safeRemoveSource(map, id) {
  try {
    if (!map.getSource(id)) return;
    // remove dependent layers first
    const layers = map.getStyle()?.layers;
    if (layers) {
      layers.filter(l => l.source === id).forEach(l => safeRemoveLayer(map, l.id));
    }
    map.removeSource(id);
  } catch {}
}

export function findVectorSource(map) {
  try {
    const sources = map.getStyle()?.sources;
    if (!sources) return 'composite';
    if (sources.composite) return 'composite';
    for (const [id, s] of Object.entries(sources)) {
      if (s.type === 'vector') return id;
    }
  } catch {}
  return 'composite';
}

export function createCircleGeoJSON(center, radiusKm, steps = 64) {
  const [lng, lat] = center;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dx = radiusKm * Math.cos(a);
    const dy = radiusKm * Math.sin(a);
    coords.push([
      lng + dx / (111.32 * Math.cos(lat * Math.PI / 180)),
      lat + dy / 110.574,
    ]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}
