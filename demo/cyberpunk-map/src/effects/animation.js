import { safeAddLayer, safeRemoveLayer, safeAddSource, safeRemoveSource } from './utils.js';

// ── Chiang Mai POIs ──
const POIS = [
  { name: 'Tha Phae Gate', coords: [98.9936, 18.7876] },
  { name: 'Wat Chedi Luang', coords: [98.9862, 18.7864] },
  { name: 'Night Bazaar', coords: [98.9979, 18.7847] },
  { name: 'Nimmanhaemin', coords: [98.9677, 18.7980] },
  { name: 'Doi Suthep', coords: [98.9218, 18.8048] },
  { name: 'Maya Mall', coords: [98.9678, 18.8005] },
  { name: 'Warorot Market', coords: [98.9963, 18.7916] },
  { name: 'Chiang Mai Gate', coords: [98.9876, 18.7818] },
];

// ── 10. Pulsing Dots ──

export const pulsingDots = {
  id: 'pulsing-dots',
  name: 'Pulsing Dots',
  group: 'Animation',
  defaultEnabled: true,
  heavyEffect: false,
  _markers: [],

  enable(map) {
    POIS.forEach(poi => {
      const el = document.createElement('div');
      el.className = 'vibe-pulse-marker';
      el.title = poi.name;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(poi.coords)
        .addTo(map);
      this._markers.push(marker);
    });
  },

  disable() {
    this._markers.forEach(m => m.remove());
    this._markers = [];
  },
};

// ── 11. Route Flow ──

const ROUTE_COORDS = [
  [98.9936, 18.7876], [98.9906, 18.7876], [98.9876, 18.7876],
  [98.9850, 18.7880], [98.9830, 18.7890], [98.9810, 18.7905],
  [98.9790, 18.7920], [98.9760, 18.7940], [98.9730, 18.7955],
  [98.9700, 18.7968], [98.9677, 18.7980],
];

// pre-computed dash sequences for smooth flow
const DASH_SEQ = (() => {
  const seq = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const a = t * 3, b = 4, c = 3 - t * 3;
    if (c > 0) seq.push([a, b, c]);
    else seq.push([0, a - 3, 3, b - (a - 3)]);
  }
  return seq;
})();

export const routeFlow = {
  id: 'route-flow',
  name: 'Route Flow',
  group: 'Animation',
  defaultEnabled: true,
  heavyEffect: false,
  _step: -1,

  enable(map, ctx) {
    safeAddSource(map, 'route-flow-src', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ROUTE_COORDS } },
    });

    const night = ctx.theme === 'night';
    safeAddLayer(map, {
      id: 'route-flow-bg', type: 'line', source: 'route-flow-src',
      paint: { 'line-color': night ? '#6b21a8' : '#c084fc', 'line-width': 6, 'line-opacity': 0.4 },
    });
    safeAddLayer(map, {
      id: 'route-flow-dash', type: 'line', source: 'route-flow-src',
      paint: {
        'line-color': night ? '#e879f9' : '#a855f7',
        'line-width': 4,
        'line-dasharray': [0, 4, 3],
      },
    });

    this._step = -1;
    ctx.rafManager.add('route-flow', (t) => {
      const s = Math.floor((t / 80) % DASH_SEQ.length);
      if (s === this._step) return;
      this._step = s;
      try {
        if (map.getLayer('route-flow-dash'))
          map.setPaintProperty('route-flow-dash', 'line-dasharray', DASH_SEQ[s]);
      } catch {}
    });
  },

  disable(map, ctx) {
    ctx.rafManager.remove('route-flow');
    safeRemoveLayer(map, 'route-flow-dash');
    safeRemoveLayer(map, 'route-flow-bg');
    safeRemoveSource(map, 'route-flow-src');
  },
};

// ── 12. Cluster Pop ──

function randomPoints(n, center, spread) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          center[0] + (Math.random() - 0.5) * spread[0],
          center[1] + (Math.random() - 0.5) * spread[1],
        ],
      },
      properties: { name: `Venue ${i + 1}` },
    });
  }
  return pts;
}

export const clusterPop = {
  id: 'cluster-pop',
  name: 'Cluster Pop',
  group: 'Animation',
  defaultEnabled: true,
  heavyEffect: false,
  _clickH: null,
  _enterH: null,
  _leaveH: null,

  enable(map) {
    safeAddSource(map, 'cluster-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: randomPoints(80, [98.98, 18.79], [0.06, 0.04]) },
      cluster: true,
      clusterMaxZoom: 15,
      clusterRadius: 50,
    });

    safeAddLayer(map, {
      id: 'clusters', type: 'circle', source: 'cluster-src',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#a855f7', 10, '#7c3aed', 30, '#6d28d9'],
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 28, 30, 38],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#e879f9',
      },
    });
    safeAddLayer(map, {
      id: 'cluster-count', type: 'symbol', source: 'cluster-src',
      filter: ['has', 'point_count'],
      layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 13 },
      paint: { 'text-color': '#fff' },
    });
    safeAddLayer(map, {
      id: 'unclustered-pt', type: 'circle', source: 'cluster-src',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#ec4899', 'circle-radius': 5,
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff',
      },
    });

    this._clickH = (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!f.length) return;
      const src = map.getSource('cluster-src');
      if (!src) return;
      src.getClusterExpansionZoom(f[0].properties.cluster_id, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: f[0].geometry.coordinates, zoom,
          duration: 500, easing: t => 1 - Math.pow(1 - t, 3),
        });
      });
    };
    this._enterH = () => { map.getCanvas().style.cursor = 'pointer'; };
    this._leaveH = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', 'clusters', this._clickH);
    map.on('mouseenter', 'clusters', this._enterH);
    map.on('mouseleave', 'clusters', this._leaveH);
  },

  disable(map) {
    if (this._clickH) map.off('click', 'clusters', this._clickH);
    if (this._enterH) map.off('mouseenter', 'clusters', this._enterH);
    if (this._leaveH) map.off('mouseleave', 'clusters', this._leaveH);
    ['cluster-count', 'clusters', 'unclustered-pt'].forEach(id => safeRemoveLayer(map, id));
    safeRemoveSource(map, 'cluster-src');
  },
};

// ── 13. Cinematic Fly-To ──

const FLY_DESTS = [
  { center: [98.9862, 18.7864], zoom: 16, pitch: 60, bearing: 30 },
  { center: [98.9677, 18.7980], zoom: 15.5, pitch: 50, bearing: -20 },
  { center: [98.9218, 18.8048], zoom: 14, pitch: 45, bearing: 60 },
  { center: [98.98, 18.79], zoom: 13, pitch: 45, bearing: -17.6 },
];

export const cinematicFlyTo = {
  id: 'cinematic-fly-to',
  name: 'Cinematic Fly-To',
  group: 'Animation',
  defaultEnabled: false,
  heavyEffect: false,
  _timeout: null,
  _idx: 0,

  enable(map) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._idx = 0;

    const next = () => {
      const dest = FLY_DESTS[this._idx % FLY_DESTS.length];
      if (reduced) {
        map.jumpTo(dest);
      } else {
        map.flyTo({ ...dest, speed: 0.4, curve: 1.5, easing: t => 1 - Math.pow(1 - t, 3), essential: true });
      }
      this._idx++;
      this._timeout = setTimeout(next, 8000);
    };
    this._timeout = setTimeout(next, 3000);
  },

  disable(map) {
    clearTimeout(this._timeout);
    try { map.stop(); } catch {}
  },
};

// ── 14. Auto-Rotate (Idle) ──

export const autoRotate = {
  id: 'auto-rotate',
  name: 'Auto-Rotate (Idle)',
  group: 'Animation',
  defaultEnabled: false,
  heavyEffect: false,
  _active: false,
  _idleTimer: null,
  _interH: null,

  enable(map, ctx) {
    this._active = true;
    const IDLE_MS = 5000;
    let startBearing = 0;
    let startTime = 0;

    const startSpin = () => {
      if (!this._active) return;
      startBearing = map.getBearing();
      startTime = performance.now();
      ctx.rafManager.add('auto-rotate', (t) => {
        if (!this._active) return;
        const elapsed = t - startTime;
        map.rotateTo(startBearing + elapsed * 0.003, { duration: 0 });
      });
    };

    const stopSpin = () => {
      ctx.rafManager.remove('auto-rotate');
      clearTimeout(this._idleTimer);
      if (this._active) this._idleTimer = setTimeout(startSpin, IDLE_MS);
    };

    this._interH = stopSpin;
    ['mousedown', 'touchstart', 'wheel'].forEach(e => map.on(e, this._interH));
    this._idleTimer = setTimeout(startSpin, IDLE_MS);
  },

  disable(map, ctx) {
    this._active = false;
    ctx.rafManager.remove('auto-rotate');
    clearTimeout(this._idleTimer);
    if (this._interH) {
      ['mousedown', 'touchstart', 'wheel'].forEach(e => map.off(e, this._interH));
    }
  },
};

export const animationEffects = [
  pulsingDots,
  routeFlow,
  clusterPop,
  cinematicFlyTo,
  autoRotate,
];
