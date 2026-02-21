import {
  safeAddLayer, safeRemoveLayer, safeAddSource, safeRemoveSource,
  findVectorSource, createCircleGeoJSON,
} from './utils.js';

// ── 15. Hover Glow ──

export const hoverGlow = {
  id: 'hover-glow',
  name: 'Hover Glow',
  group: 'Interaction',
  defaultEnabled: true,
  heavyEffect: false,
  _moveH: null,
  _leaveH: null,
  _hoveredId: null,
  _src: null,
  _srcLayer: 'building',

  enable(map) {
    this._src = findVectorSource(map);
    this._hoveredId = null;

    // highlight layer — flat fill under buildings
    safeAddLayer(map, {
      id: 'hover-glow-layer', type: 'fill',
      source: this._src, 'source-layer': this._srcLayer,
      minzoom: 14,
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          'rgba(232, 121, 249, 0.45)',
          'rgba(0, 0, 0, 0)',
        ],
      },
    });

    this._moveH = (e) => {
      if (!e.features || !e.features.length) return;
      const id = e.features[0].id;
      if (id === undefined) return;

      if (this._hoveredId !== null && this._hoveredId !== id) {
        map.setFeatureState(
          { source: this._src, sourceLayer: this._srcLayer, id: this._hoveredId },
          { hover: false },
        );
      }
      this._hoveredId = id;
      map.setFeatureState(
        { source: this._src, sourceLayer: this._srcLayer, id },
        { hover: true },
      );
    };

    this._leaveH = () => {
      if (this._hoveredId !== null) {
        map.setFeatureState(
          { source: this._src, sourceLayer: this._srcLayer, id: this._hoveredId },
          { hover: false },
        );
        this._hoveredId = null;
      }
    };

    map.on('mousemove', 'hover-glow-layer', this._moveH);
    map.on('mouseleave', 'hover-glow-layer', this._leaveH);
  },

  disable(map) {
    if (this._moveH) map.off('mousemove', 'hover-glow-layer', this._moveH);
    if (this._leaveH) map.off('mouseleave', 'hover-glow-layer', this._leaveH);
    if (this._hoveredId !== null) {
      try {
        map.setFeatureState(
          { source: this._src, sourceLayer: this._srcLayer, id: this._hoveredId },
          { hover: false },
        );
      } catch {}
    }
    safeRemoveLayer(map, 'hover-glow-layer');
    this._hoveredId = null;
  },
};

// ── 16. Walk Radius ──

const WR_CENTER = [98.9936, 18.7876]; // Tha Phae Gate
const WR_RADII = [0.5, 1.0, 1.5]; // km
const WR_COLORS = [
  'rgba(168, 85, 247, 0.25)',
  'rgba(168, 85, 247, 0.13)',
  'rgba(168, 85, 247, 0.06)',
];

export const walkRadius = {
  id: 'walk-radius',
  name: 'Walk Radius',
  group: 'Interaction',
  defaultEnabled: true,
  heavyEffect: false,
  _interval: null,

  enable(map) {
    WR_RADII.forEach((r, i) => {
      const circle = createCircleGeoJSON(WR_CENTER, r, 64);
      safeAddSource(map, `walk-r-${i}`, { type: 'geojson', data: circle });
      safeAddLayer(map, {
        id: `walk-r-${i}`, type: 'fill', source: `walk-r-${i}`,
        paint: {
          'fill-color': WR_COLORS[i],
          'fill-outline-color': 'rgba(168, 85, 247, 0.45)',
        },
      });
    });

    // outline rings
    WR_RADII.forEach((r, i) => {
      safeAddLayer(map, {
        id: `walk-r-line-${i}`, type: 'line', source: `walk-r-${i}`,
        paint: {
          'line-color': '#a855f7',
          'line-width': 1.5,
          'line-opacity': 0.5,
          'line-dasharray': [4, 4],
        },
      });
    });

    // gentle pulse on inner ring via opacity transition
    let high = true;
    // set transition first
    try {
      map.setPaintProperty('walk-r-0', 'fill-opacity-transition', { duration: 1800 });
    } catch {}
    this._interval = setInterval(() => {
      high = !high;
      try {
        if (map.getLayer('walk-r-0'))
          map.setPaintProperty('walk-r-0', 'fill-opacity', high ? 1 : 0.4);
      } catch {}
    }, 1800);
  },

  disable(map) {
    clearInterval(this._interval);
    WR_RADII.forEach((_, i) => {
      safeRemoveLayer(map, `walk-r-line-${i}`);
      safeRemoveLayer(map, `walk-r-${i}`);
      safeRemoveSource(map, `walk-r-${i}`);
    });
  },
};

// ── 17. Sound Reactive ──

export const soundReactive = {
  id: 'sound-reactive',
  name: 'Sound Reactive',
  group: 'Interaction',
  defaultEnabled: false,
  heavyEffect: true,
  _stream: null,
  _analyser: null,
  _targetLayer: null,

  enable(map, ctx) {
    this._init(map, ctx);
  },

  async _init(map, ctx) {
    try {
      if (!ctx.audioCtx) ctx.audioCtx = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._stream = stream;

      const src = ctx.audioCtx.createMediaStreamSource(stream);
      this._analyser = ctx.audioCtx.createAnalyser();
      this._analyser.fftSize = 64;
      src.connect(this._analyser);

      const data = new Uint8Array(this._analyser.frequencyBinCount);

      // determine target layer
      this._targetLayer = map.getLayer('gradient-buildings-layer')
        ? 'gradient-buildings-layer'
        : null;

      if (!this._targetLayer) {
        // add our own building layer
        safeAddLayer(map, {
          id: 'sound-reactive-buildings', type: 'fill-extrusion',
          source: findVectorSource(map), 'source-layer': 'building',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#a855f7',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.8,
          },
        });
        this._targetLayer = 'sound-reactive-buildings';
      }

      let lastT = 0;
      ctx.rafManager.add('sound-reactive', (t) => {
        if (t - lastT < 80) return; // ~12fps
        lastT = t;
        this._analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;

        // map to gradient colors — more energy = brighter/pinker
        const r = Math.round(100 + avg * 155);
        const g = Math.round(20 + avg * 20);
        const b = Math.round(160 + avg * 95);
        try {
          if (map.getLayer(this._targetLayer)) {
            map.setPaintProperty(this._targetLayer, 'fill-extrusion-color', [
              'interpolate', ['linear'], ['get', 'height'],
              0, `rgb(${r >> 1}, ${g >> 1}, ${b >> 1})`,
              15, `rgb(${r}, ${g}, ${b})`,
              40, `rgb(${Math.min(255, r + 60)}, ${g}, ${Math.min(255, b + 30)})`,
            ]);
          }
        } catch {}
      });
    } catch (e) {
      console.warn('[VibeCity] Sound Reactive:', e.message);
    }
  },

  disable(map, ctx) {
    ctx.rafManager.remove('sound-reactive');
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    // clean up self-added layer
    if (this._targetLayer === 'sound-reactive-buildings') {
      safeRemoveLayer(map, 'sound-reactive-buildings');
    }
    this._targetLayer = null;
  },
};

export const interactionEffects = [
  hoverGlow,
  walkRadius,
  soundReactive,
];
