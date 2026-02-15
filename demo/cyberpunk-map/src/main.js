import { EffectsRegistry } from './effects/registry.js';
import { atmosphereEffects } from './effects/atmosphere.js';
import { modelsEffects } from './effects/models3d.js';
import { animationEffects } from './effects/animation.js';
import { interactionEffects } from './effects/interaction.js';
import { createControls } from './ui/controls.js';

// ── Token ──
const params = new URLSearchParams(location.search);
const token =
  params.get('token') ||
  localStorage.getItem('mapbox-token') ||
  prompt('Enter your Mapbox access token:');

if (!token) {
  document.getElementById('map').textContent = 'Mapbox token required. Add ?token=YOUR_TOKEN to URL.';
  throw new Error('No Mapbox token');
}
localStorage.setItem('mapbox-token', token);
mapboxgl.accessToken = token;

// ── Device tier detection ──
function detectTier() {
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'mid';
  return 'high';
}

// ── Map ──
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [98.98, 18.79],
  zoom: 13,
  pitch: 45,
  bearing: -17.6,
  antialias: true,
  hash: true,
});

map.addControl(new mapboxgl.NavigationControl(), 'top-left');

map.on('load', () => {
  const reg = new EffectsRegistry(map, {
    theme: 'night',
    debug: true,
    deviceTier: detectTier(),
  });

  // Register all 17 effects
  reg.registerAll([
    ...atmosphereEffects,
    ...modelsEffects,
    ...animationEffects,
    ...interactionEffects,
  ]);

  // Enable defaults (respects device tier)
  reg.effects.forEach(fx => {
    if (fx.defaultEnabled) reg.enable(fx.id);
  });

  // Controls panel
  createControls(reg);

  // Self-check
  reg.selfCheck();

  // Expose for debugging
  window.__vibeCity = { map, registry: reg };
  console.log('[VibeCity] Ready — window.__vibeCity');
});
