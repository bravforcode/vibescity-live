import { safeAddLayer, safeRemoveLayer, safeAddSource, safeRemoveSource, findVectorSource } from './utils.js';

// ── 6. Custom 3D Models (Three.js custom layer) ──

export const custom3dModels = {
  id: 'custom-3d-models',
  name: 'Custom 3D Models',
  group: '3D & Models',
  defaultEnabled: false,
  heavyEffect: true,
  _layerId: 'threejs-model-layer',

  enable(map, _ctx) {
    this._setup(map);
  },

  async _setup(map) {
    let THREE;
    try {
      THREE = await import('three');
    } catch {
      console.warn('[VibeCity] Three.js unavailable — skipping 3D models');
      return;
    }

    const origin = [98.9862, 18.7864];
    const mc = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0);
    const scale = mc.meterInMercatorCoordinateUnits();

    const customLayer = {
      id: this._layerId,
      type: 'custom',
      renderingMode: '3d',
      _scene: null, _camera: null, _renderer: null,

      onAdd(_map, gl) {
        this._camera = new THREE.Camera();
        this._scene = new THREE.Scene();
        this._scene.add(new THREE.AmbientLight(0xa855f7, 2));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(0, 70, 100);
        this._scene.add(dir);

        this._loadModel(THREE).catch(() => this._addFallbackCube(THREE));

        this._renderer = new THREE.WebGLRenderer({
          canvas: _map.getCanvas(), context: gl, antialias: true,
        });
        this._renderer.autoClear = false;
        this._map = _map;
      },

      async _loadModel(T) {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        return new Promise((res, rej) => {
          loader.load('assets/models/sample.glb',
            (gltf) => { this._scene.add(gltf.scene); res(); },
            undefined,
            () => rej(new Error('glb missing')),
          );
        });
      },

      _addFallbackCube(T) {
        const geo = new T.BoxGeometry(20, 20, 20);
        const mat = new T.MeshPhongMaterial({
          color: 0xa855f7, emissive: 0x6b21a8, transparent: true, opacity: 0.85,
        });
        this._scene.add(new T.Mesh(geo, mat));
      },

      render(_gl, matrix) {
        const T = THREE;
        const m = new T.Matrix4().fromArray(matrix);
        const l = new T.Matrix4()
          .makeTranslation(mc.x, mc.y, mc.z)
          .scale(new T.Vector3(scale, -scale, scale))
          .multiply(new T.Matrix4().makeRotationX(Math.PI / 2));

        this._camera.projectionMatrix = m.multiply(l);
        this._renderer.resetState();
        this._renderer.render(this._scene, this._camera);
        this._map.triggerRepaint();
      },
    };

    safeAddLayer(map, customLayer);
  },

  disable(map) { safeRemoveLayer(map, this._layerId); },
};

// ── 7. Video Billboards ──

const BILLBOARD_LOCS = [
  [98.9979, 18.7847],
  [98.9677, 18.7980],
];

export const videoBillboards = {
  id: 'video-billboards',
  name: 'Video Billboards',
  group: '3D & Models',
  defaultEnabled: false,
  heavyEffect: true,
  _markers: [],

  enable(map) {
    BILLBOARD_LOCS.forEach(([lng, lat]) => {
      const el = document.createElement('div');
      el.className = 'vibe-billboard';

      const video = document.createElement('video');
      video.src = 'assets/video/billboard.mp4';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;

      const fallback = () => {
        if (el.querySelector('.billboard-text')) return;
        video.remove();
        const span = document.createElement('span');
        span.className = 'billboard-text';
        span.textContent = 'VIBECITY';
        el.appendChild(span);
      };
      video.onerror = fallback;
      el.appendChild(video);
      video.play().catch(fallback);

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      this._markers.push(marker);
    });
  },

  disable() {
    this._markers.forEach(m => {
      const v = m.getElement().querySelector('video');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      m.remove();
    });
    this._markers = [];
  },
};

// ── 8. 3D Terrain ──

export const terrain3d = {
  id: '3d-terrain',
  name: '3D Terrain',
  group: '3D & Models',
  defaultEnabled: true,
  heavyEffect: false,

  enable(map, ctx) {
    if (!map.setTerrain) {
      console.warn('[VibeCity] Terrain API not available');
      return;
    }
    safeAddSource(map, 'mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
    const ex = ctx.deviceTier === 'low' ? 1 : 1.5;
    try { map.setTerrain({ source: 'mapbox-dem', exaggeration: ex }); } catch (e) {
      console.warn('[VibeCity] setTerrain failed:', e.message);
    }
  },

  disable(map) {
    try { map.setTerrain?.(null); } catch {}
    safeRemoveSource(map, 'mapbox-dem');
  },
};

// ── 9. Reflective Water ──

export const reflectiveWater = {
  id: 'reflective-water',
  name: 'Reflective Water',
  group: '3D & Models',
  defaultEnabled: true,
  heavyEffect: false,
  _interval: null,

  enable(map, ctx) {
    const night = ctx.theme === 'night';
    safeAddLayer(map, {
      id: 'reflective-water-layer', type: 'fill',
      source: findVectorSource(map), 'source-layer': 'water',
      paint: {
        'fill-color': night ? '#1e0936' : '#c4b5fd',
        'fill-opacity': 0.65,
        'fill-opacity-transition': { duration: 2000 },
      },
    });
    let high = true;
    this._interval = setInterval(() => {
      high = !high;
      try {
        if (map.getLayer('reflective-water-layer'))
          map.setPaintProperty('reflective-water-layer', 'fill-opacity', high ? 0.65 : 0.45);
      } catch {}
    }, 2000);
  },

  disable(map) {
    clearInterval(this._interval);
    safeRemoveLayer(map, 'reflective-water-layer');
  },
};

export const modelsEffects = [
  custom3dModels,
  videoBillboards,
  terrain3d,
  reflectiveWater,
];
