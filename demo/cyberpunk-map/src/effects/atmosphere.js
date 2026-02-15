import { safeAddLayer, safeRemoveLayer, safeAddSource, safeRemoveSource, findVectorSource } from './utils.js';

// ── 1. Neon Street Glow ──

const NEON_IDS = ['neon-glow-outer', 'neon-glow-inner', 'neon-glow-core'];
const ROAD_FILTER = ['match', ['get', 'class'],
  ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false];

export const neonStreetGlow = {
  id: 'neon-street-glow',
  name: 'Neon Street Glow',
  group: 'Atmosphere & Lighting',
  defaultEnabled: true,
  heavyEffect: false,

  enable(map, ctx) {
    const src = findVectorSource(map);
    const night = ctx.theme === 'night';
    const pri = night ? '#a855f7' : '#7c3aed';
    const sec = night ? '#ec4899' : '#db2777';

    safeAddLayer(map, {
      id: 'neon-glow-outer', type: 'line', source: src, 'source-layer': 'road',
      filter: ROAD_FILTER,
      paint: {
        'line-color': pri,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 18],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 16],
        'line-opacity': 0.15,
      },
    });
    safeAddLayer(map, {
      id: 'neon-glow-inner', type: 'line', source: src, 'source-layer': 'road',
      filter: ROAD_FILTER,
      paint: {
        'line-color': sec,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 8],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 6],
        'line-opacity': 0.35,
      },
    });
    safeAddLayer(map, {
      id: 'neon-glow-core', type: 'line', source: src, 'source-layer': 'road',
      filter: ROAD_FILTER,
      paint: {
        'line-color': '#fff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2],
        'line-opacity': 0.6,
      },
    });
  },

  disable(map) { NEON_IDS.forEach(id => safeRemoveLayer(map, id)); },
};

// ── 2. Atmospheric Fog ──

export const atmosphericFog = {
  id: 'atmospheric-fog',
  name: 'Atmospheric Fog',
  group: 'Atmosphere & Lighting',
  defaultEnabled: true,
  heavyEffect: false,
  _prev: null,

  enable(map, ctx) {
    try { this._prev = map.getFog?.(); } catch { this._prev = null; }
    if (!map.setFog) return;
    const night = ctx.theme === 'night';
    map.setFog(night
      ? { color: '#1a0a2e', 'high-color': '#2d1b4e', 'horizon-blend': 0.08,
          'space-color': '#0a0015', 'star-intensity': 0.85 }
      : { color: '#ede9fe', 'high-color': '#c4b5fd', 'horizon-blend': 0.05,
          'space-color': '#f5f3ff', 'star-intensity': 0 });
  },

  disable(map) {
    if (map.setFog) map.setFog(this._prev ?? {});
  },
};

// ── 3. Dynamic Sky ──

export const dynamicSky = {
  id: 'dynamic-sky',
  name: 'Dynamic Sky',
  group: 'Atmosphere & Lighting',
  defaultEnabled: true,
  heavyEffect: false,
  _interval: null,

  enable(map, ctx) {
    const update = () => {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      const azimuth = ((h / 24) * 360 + 180) % 360;
      // polar: 0=zenith, 90=horizon — peak at noon
      const noon = Math.sin(((h - 6) / 12) * Math.PI);
      const polar = 90 - Math.max(noon, -0.1) * 70;
      const night = ctx.theme === 'night';

      safeAddLayer(map, {
        id: 'dynamic-sky-layer', type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [azimuth, Math.max(polar, 0.1)],
          'sky-atmosphere-sun-intensity': night ? 2 : 10,
          'sky-atmosphere-color': night ? '#1a0a2e' : '#6cb4ee',
        },
      });
    };
    update();
    this._interval = setInterval(update, 60_000);
  },

  disable(map) {
    clearInterval(this._interval);
    safeRemoveLayer(map, 'dynamic-sky-layer');
  },
};

// ── 4. Volumetric Spotlights ──

const SPOT_LOCS = [
  [98.9936, 18.7876], // Tha Phae Gate
  [98.9979, 18.7847], // Night Bazaar
  [98.9862, 18.7864], // Wat Chedi Luang
  [98.9730, 18.7955], // Maya Mall area
];

function makeBeamPoly([lng, lat], r = 0.00025) {
  const ring = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * r, lat + Math.sin(a) * r]);
  }
  return ring;
}

export const volumetricSpotlights = {
  id: 'volumetric-spotlights',
  name: 'Volumetric Spotlights',
  group: 'Atmosphere & Lighting',
  defaultEnabled: false,
  heavyEffect: true,
  _interval: null,

  enable(map, ctx) {
    const features = SPOT_LOCS.map(c => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [makeBeamPoly(c)] },
      properties: { height: 250 + Math.random() * 150 },
    }));

    safeAddSource(map, 'spotlights-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    const color = ctx.theme === 'night' ? '#a855f7' : '#7c3aed';
    safeAddLayer(map, {
      id: 'spotlights-layer', type: 'fill-extrusion', source: 'spotlights-src',
      paint: {
        'fill-extrusion-color': color,
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.12,
        'fill-extrusion-opacity-transition': { duration: 2500 },
      },
    });

    // gentle breath
    let bright = true;
    this._interval = setInterval(() => {
      bright = !bright;
      try {
        if (map.getLayer('spotlights-layer'))
          map.setPaintProperty('spotlights-layer', 'fill-extrusion-opacity', bright ? 0.15 : 0.07);
      } catch {}
    }, 2500);
  },

  disable(map) {
    clearInterval(this._interval);
    safeRemoveLayer(map, 'spotlights-layer');
    safeRemoveSource(map, 'spotlights-src');
  },
};

// ── 5. Gradient Buildings ──

export const gradientBuildings = {
  id: 'gradient-buildings',
  name: 'Gradient Buildings',
  group: 'Atmosphere & Lighting',
  defaultEnabled: true,
  heavyEffect: false,

  enable(map, ctx) {
    const night = ctx.theme === 'night';
    const c = night
      ? ['#0a0015', '#6b21a8', '#ec4899']
      : ['#ede9fe', '#a855f7', '#ec4899'];

    safeAddLayer(map, {
      id: 'gradient-buildings-layer', type: 'fill-extrusion',
      source: findVectorSource(map), 'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'height'],
          0, c[0], 15, c[1], 40, c[2],
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'], 12, 0, 13, ['get', 'height'],
        ],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.85,
      },
    });
  },

  disable(map) { safeRemoveLayer(map, 'gradient-buildings-layer'); },
};

export const atmosphereEffects = [
  neonStreetGlow,
  atmosphericFog,
  dynamicSky,
  volumetricSpotlights,
  gradientBuildings,
];
