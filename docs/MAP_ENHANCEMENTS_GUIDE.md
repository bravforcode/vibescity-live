# Map Enhancements Guide

Complete guide for using the enhanced map features in VibeCity.

## 📋 Table of Contents

1. [Performance Optimization](#performance-optimization)
2. [Advanced Neon Effects](#advanced-neon-effects)
3. [Enhanced Gestures](#enhanced-gestures)
4. [Advanced Layers](#advanced-layers)
5. [Enhanced Markers](#enhanced-markers)
6. [Real-time Features](#real-time-features)
7. [Integration Examples](#integration-examples)

---

## 🚀 Performance Optimization

### useMapPerformance

Adaptive performance optimization based on device capabilities and current FPS.

```javascript
import { useMapPerformance } from '@/composables/map/useMapPerformance';

const {
  currentFPS,
  performanceMode,
  lodConfig,
  startMonitoring,
  stopMonitoring,
} = useMapPerformance(map);

// Start monitoring
startMonitoring();

// Access current performance mode
console.log(performanceMode.value); // 'high', 'medium', 'low', 'critical'

// Get LOD configuration
const config = lodConfig.value;
console.log(config.maxMarkers); // Adaptive marker limit
```

### Features

- **Adaptive LOD**: Automatically adjusts detail level based on FPS
- **Memory Management**: Monitors and optimizes memory usage
- **Battery Detection**: Reduces performance on low battery
- **Frame Rate Monitoring**: Real-time FPS tracking
- **Smart Throttling**: Intelligent update throttling

---

## ✨ Advanced Neon Effects

### useAdvancedNeonEffects

Dynamic neon sign effects with time-based intensity and animations.

```javascript
import { useAdvancedNeonEffects } from '@/composables/map/useAdvancedNeonEffects';

const {
  timeOfDay,
  baseIntensity,
  getNeonStyles,
  init,
} = useAdvancedNeonEffects();

// Initialize
init();

// Get neon styles for a venue
const styles = getNeonStyles(shop, {
  paletteId: 'plasma-pink',
  isLive: true,
  isSelected: false,
});

// Apply styles
Object.assign(element.style, styles);
```

### Features

- **Time-based Intensity**: Neon brightness adjusts based on time of day
- **Flicker Effects**: Realistic neon tube flickering
- **Pulse Animations**: For LIVE venues
- **Rainbow Mode**: Special event cycling colors
- **8 Color Palettes**: Plasma Pink, Electric Cyan, Volt Lime, etc.

### CSS Classes

```html
<!-- Basic neon sign -->
<div class="neon-sign neon-plasma-pink neon-glow-medium">
  VIBECITY
</div>

<!-- Live venue with pulse -->
<div class="neon-sign neon-electric-cyan neon-live">
  LIVE NOW
</div>

<!-- With shape and border -->
<div class="neon-sign neon-volt-lime neon-shape-capsule neon-border-double-line">
  OPEN
</div>
```

---

## 👆 Enhanced Gestures

### useAdvancedGestures

Advanced touch and mouse gesture recognition with haptic feedback.

```javascript
import { useAdvancedGestures } from '@/composables/map/useAdvancedGestures';

const {
  isGesturing,
  gestureType,
  gestureHistory,
} = useAdvancedGestures(mapContainer, map, {
  enableMomentumZoom: true,
  enableKeyboardShortcuts: true,
  onLongPress: (pos) => {
    console.log('Long press at:', pos);
  },
  onSwipe: ({ direction, velocity }) => {
    console.log('Swipe:', direction, velocity);
  },
});
```

### Supported Gestures

- **Single Tap**: Select marker
- **Double Tap**: Zoom in
- **Long Press**: Context menu
- **Swipe**: Navigate
- **Pinch**: Zoom
- **Rotate**: Rotate map
- **Momentum Scrolling**: Smooth panning

### Keyboard Shortcuts

- `+` / `=`: Zoom in
- `-` / `_`: Zoom out
- `R`: Reset north
- `F`: Focus on user location

---

## 🗺️ Advanced Layers

### useAdvancedLayers

Dynamic map layers with real-time updates and animations.

```javascript
import { useAdvancedLayers } from '@/composables/map/useAdvancedLayers';

const {
  addHeatmapLayer,
  addTrafficLayer,
  add3DBuildingsLayer,
  addWeatherLayer,
  toggleLayer,
  setLayerOpacity,
} = useAdvancedLayers(map);

// Add heat map
addHeatmapLayer([
  { lat: 18.7985, lng: 98.968, intensity: 5 },
  { lat: 18.7990, lng: 98.969, intensity: 3 },
]);

// Add traffic layer
addTrafficLayer(trafficData);

// Add 3D buildings
add3DBuildingsLayer();

// Add weather overlay
weatherConfig.value.type = 'rain';
weatherConfig.value.intensity = 0.7;
addWeatherLayer();

// Toggle layer visibility
toggleLayer('heatmap', false);

// Set layer opacity
setLayerOpacity('traffic', 0.5);
```

### Available Layers

1. **Heat Map**: Crowd density visualization
2. **Traffic**: Real-time traffic flow with animation
3. **3D Buildings**: Extruded buildings with lighting
4. **Weather**: Rain, snow, fog, clouds overlays
5. **Events**: Special event zones
6. **Custom POI**: Custom points of interest

---

## 📍 Enhanced Markers

### useEnhancedMarkers

Advanced marker system with animations and smart clustering.

```javascript
import { useEnhancedMarkers } from '@/composables/map/useEnhancedMarkers';

const {
  addMarker,
  updateMarkerStyle,
  highlightMarker,
  addMarkersBatch,
} = useEnhancedMarkers(map);

// Add single marker
addMarker(shop, {
  size: 'medium',
  shape: 'circle',
  color: '#3b82f6',
  icon: '🍺',
  animation: 'pulse',
  priority: 10,
});

// Add batch with staggered animation
addMarkersBatch(shops, {
  size: 'small',
  shape: 'pin',
  color: '#ef4444',
}, 50); // 50ms stagger delay

// Update marker style
updateMarkerStyle(shopId, {
  color: '#10b981',
  animation: 'bounce',
});

// Highlight marker
highlightMarker(shopId, true);
```

### Marker Shapes

- `circle`: Round marker
- `square`: Square marker
- `diamond`: Diamond shape
- `star`: Star emoji
- `heart`: Heart emoji
- `pin`: Pin shape

### Marker Animations

- `bounce`: Bouncing animation
- `pulse`: Pulsing scale
- `shake`: Shaking motion
- `glow`: Glowing effect
- `spin`: Rotating
- `float`: Floating up/down

---

## 🔴 Real-time Features

### useRealtimeFeatures

WebSocket-based real-time updates with polling fallback.

```javascript
import { useRealtimeFeatures } from '@/composables/map/useRealtimeFeatures';

const {
  trafficData,
  venueStatuses,
  liveEvents,
  isConnected,
  getVenueStatus,
  isVenueLive,
  init,
} = useRealtimeFeatures(map, {
  wsUrl: 'wss://api.vibecity.live/ws',
  apiUrl: 'https://api.vibecity.live',
  onTrafficUpdate: (data) => {
    console.log('Traffic updated:', data);
  },
  onVenueStatusUpdate: (venueId, status) => {
    console.log('Venue status:', venueId, status);
  },
});

// Initialize
init();

// Check venue status
const status = getVenueStatus(venueId);
console.log(status.crowdLevel); // 0-100
console.log(status.waitTime); // minutes

// Check if venue is live
if (isVenueLive(venueId)) {
  console.log('Venue is LIVE!');
}
```

### Real-time Data Types

1. **Traffic**: Road congestion and incidents
2. **Venue Status**: Open/closed, crowd level, wait time
3. **Live Events**: Active events with locations
4. **Crowd Density**: Area-based crowd levels
5. **Hotspots**: Dynamic popularity hotspots

---

## 🎯 Integration Examples

### Complete Map Setup

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { useMapCore } from '@/composables/map/useMapCore';
import { useMapPerformance } from '@/composables/map/useMapPerformance';
import { useAdvancedNeonEffects } from '@/composables/map/useAdvancedNeonEffects';
import { useAdvancedGestures } from '@/composables/map/useAdvancedGestures';
import { useAdvancedLayers } from '@/composables/map/useAdvancedLayers';
import { useEnhancedMarkers } from '@/composables/map/useEnhancedMarkers';
import { useRealtimeFeatures } from '@/composables/map/useRealtimeFeatures';

const mapContainer = ref(null);

// Core map
const { map, isMapReady, initMap } = useMapCore(mapContainer);

// Performance
const { startMonitoring, performanceMode } = useMapPerformance(map);

// Neon effects
const { init: initNeon, getNeonStyles } = useAdvancedNeonEffects();

// Gestures
const gestures = useAdvancedGestures(mapContainer, map, {
  enableMomentumZoom: true,
  enableKeyboardShortcuts: true,
});

// Layers
const {
  addHeatmapLayer,
  addTrafficLayer,
  add3DBuildingsLayer,
} = useAdvancedLayers(map);

// Markers
const { addMarkersBatch } = useEnhancedMarkers(map);

// Real-time
const { init: initRealtime } = useRealtimeFeatures(map, {
  wsUrl: 'wss://api.vibecity.live/ws',
});

onMounted(() => {
  // Initialize map
  initMap([98.968, 18.7985], 15);

  // Wait for map ready
  watch(isMapReady, (ready) => {
    if (!ready) return;

    // Start performance monitoring
    startMonitoring();

    // Initialize neon effects
    initNeon();

    // Add layers
    add3DBuildingsLayer();
    addTrafficLayer(trafficData);

    // Add markers
    addMarkersBatch(shops, {
      size: 'medium',
      shape: 'circle',
      animation: 'pulse',
    });

    // Initialize real-time
    initRealtime();
  });
});
</script>

<template>
  <div ref="mapContainer" class="map-container" />
</template>
```

### Performance-Aware Rendering

```javascript
// Adjust rendering based on performance mode
watch(performanceMode, (mode) => {
  switch (mode) {
    case 'high':
      // Enable all features
      add3DBuildingsLayer();
      weatherConfig.value.animated = true;
      break;

    case 'medium':
      // Reduce some features
      weatherConfig.value.animated = false;
      break;

    case 'low':
      // Minimal features
      removeLayer('buildings-3d');
      removeLayer('weather');
      break;

    case 'critical':
      // Essential only
      clearMarkers();
      removeLayer('heatmap');
      break;
  }
});
```

### Dynamic Neon Updates

```javascript
// Update neon styles based on venue status
watch(venueStatuses, (statuses) => {
  statuses.forEach((status, venueId) => {
    const isLive = status.isLive;
    const styles = getNeonStyles(venue, {
      paletteId: 'electric-cyan',
      isLive,
      enablePulse: isLive,
    });

    updateMarkerStyle(venueId, {
      animation: isLive ? 'pulse' : null,
    });
  });
});
```

---

## 🎨 Styling Guide

### Neon Color Palettes

```css
/* Plasma Pink - Vibrant nightlife */
.neon-plasma-pink { color: #ff4d9d; }

/* Electric Cyan - Modern tech */
.neon-electric-cyan { color: #4ae3ff; }

/* Volt Lime - Energy & excitement */
.neon-volt-lime { color: #8aff4a; }

/* Sunset Amber - Warm & inviting */
.neon-sunset-amber { color: #ffc14a; }

/* Ultra Cyan - Premium venues */
.neon-ultra-cyan { color: #b07bff; }

/* Ruby Neon - Passionate & bold */
.neon-ruby-neon { color: #ff5d63; }

/* Aqua Mint - Fresh & cool */
.neon-aqua-mint { color: #59ffc6; }

/* Laser Blue - Futuristic */
.neon-laser-blue { color: #6f95ff; }
```

---

## 🔧 Configuration

### Performance Thresholds

```javascript
const FPS_TARGET = 60;
const FPS_THRESHOLD_LOW = 30;
const FPS_THRESHOLD_CRITICAL = 20;
const MEMORY_PRESSURE_THRESHOLD = 0.8;
```

### Update Intervals

```javascript
const UPDATE_INTERVALS = {
  traffic: 30000,      // 30 seconds
  venues: 60000,       // 1 minute
  events: 120000,      // 2 minutes
  crowdDensity: 45000, // 45 seconds
  hotspots: 90000,     // 1.5 minutes
};
```

---

## 📱 Mobile Optimization

All features are optimized for mobile devices:

- Touch gesture support
- Reduced motion support
- Battery-aware performance
- Memory-efficient rendering
- Adaptive quality settings

---

## ♿ Accessibility

- Keyboard navigation support
- Screen reader friendly
- High contrast mode support
- Reduced motion respect
- Focus indicators

---

## 🐛 Troubleshooting

### Low FPS

```javascript
// Check performance mode
console.log(performanceMode.value);

// Manually trigger optimization
triggerMemoryOptimization();

// Reduce marker count
clusterConfig.value.radius = 80;
```

### WebSocket Connection Issues

```javascript
// Check connection status
console.log(isConnected.value);

// Fallback to polling
if (!isConnected.value) {
  startPolling();
}
```

### Memory Leaks

```javascript
// Cleanup on unmount
onUnmounted(() => {
  stopMonitoring();
  cleanup();
  clearMarkers();
});
```

---

## 📚 API Reference

See individual composable files for detailed API documentation:

- `useMapPerformance.js`
- `useAdvancedNeonEffects.js`
- `useAdvancedGestures.js`
- `useAdvancedLayers.js`
- `useEnhancedMarkers.js`
- `useRealtimeFeatures.js`

---

## 🎉 Best Practices

1. **Always initialize performance monitoring first**
2. **Use adaptive rendering based on performance mode**
3. **Cleanup resources on component unmount**
4. **Respect user's motion preferences**
5. **Test on low-end devices**
6. **Monitor memory usage**
7. **Use WebSocket for real-time, polling as fallback**
8. **Batch marker operations**
9. **Throttle frequent updates**
10. **Profile performance regularly**

---

## 📄 License

MIT License - VibeCity 2026
