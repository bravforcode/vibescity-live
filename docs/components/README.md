# VibeCity Component Documentation

> 📚 **Enterprise-Grade Component Documentation**  
> Comprehensive documentation for all VibeCity components with examples, best practices, and integration guides.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Core Components](#core-components)
- [Map Components](#map-components)
- [UI Components](#ui-components)
- [Composables](#composables)
- [Utilities](#utilities)
- [Integration Examples](#integration-examples)
- [Performance Guidelines](#performance-guidelines)
- [Accessibility Standards](#accessibility-standards)
- [Testing Guidelines](#testing-guidelines)

---

## 🎯 Overview

VibeCity components are built with **Vue 3 + Composition API** and follow enterprise-grade standards:

### Architecture Principles
- **Composition First**: All logic encapsulated in composables
- **Performance Optimized**: Lazy loading, virtualization, caching
- **Accessibility First**: WCAG 2.1 AA compliance
- **Type Safe**: Full TypeScript support
- **Testable**: Unit + E2E + Visual testing

### Design System
- **Responsive**: Mobile-first design
- **Themeable**: CSS custom properties
- **Internationalizable**: i18n support
- **Animation Aware**: Respect `prefers-reduced-motion`

---

## 🗺️ Core Components

### VibeMap
**Main map component with enterprise features**

```vue
<template>
  <VibeMap
    :initial-center="[13.7563, 100.5018]"
    :initial-zoom="12"
    :show-controls="true"
    :enable-clustering="true"
    @map-ready="handleMapReady"
    @venue-click="handleVenueClick"
  />
</template>

<script setup>
import { VibeMap } from '@/components/map/VibeMap.vue'
import { useSentientMap } from '@/composables/engine/useSentientMap'

const { initializeMap, addVenueLayer } = useSentientMap()

const handleMapReady = (mapInstance) => {
  initializeMap(mapInstance)
  addVenueLayer()
}

const handleVenueClick = (venue) => {
  console.log('Venue clicked:', venue)
}
</script>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialCenter` | `[number, number]` | `[13.7563, 100.5018]` | Initial map center `[lat, lng]` |
| `initialZoom` | `number` | `12` | Initial zoom level |
| `showControls` | `boolean` | `true` | Show map controls |
| `enableClustering` | `boolean` | `true` | Enable venue clustering |
| `theme` | `'light' \| 'dark'` | `'light'` | Map theme |
| `maxBounds` | `Bounds` | `null` | Maximum map bounds |

**Events:**
| Event | Payload | Description |
|-------|---------|-------------|
| `map-ready` | `map: MapboxMap` | Map initialized |
| `venue-click` | `venue: Venue` | Venue marker clicked |
| `bounds-changed` | `bounds: Bounds` | Viewport bounds changed |

---

### VenueDrawer
**Slide-out drawer for venue details**

```vue
<template>
  <VenueDrawer
    :venue="selectedVenue"
    :is-open="isDrawerOpen"
    @close="handleClose"
    @directions-request="handleDirections"
  />
</template>

<script setup>
import { VenueDrawer } from '@/components/ui/VenueDrawer.vue'

const selectedVenue = ref(null)
const isDrawerOpen = ref(false)

const handleClose = () => {
  isDrawerOpen.value = false
}

const handleDirections = (venue) => {
  // Handle directions request
}
</script>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `venue` | `Venue \| null` | `null` | Venue data to display |
| `isOpen` | `boolean` | `false` | Drawer open state |
| `position` | `'left' \| 'right'` | `'right'` | Drawer position |

---

## 🗺️ Map Components

### VenueMarker
**Interactive venue marker with clustering support**

```vue
<template>
  <VenueMarker
    :venue="venue"
    :is-clustered="true"
    :size="markerSize"
    @click="handleMarkerClick"
  />
</template>
```

### MapControls
**Map navigation controls**

```vue
<template>
  <MapControls
    :show-zoom="true"
    :show-compass="true"
    :show-location="true"
    @zoom-in="handleZoomIn"
    @zoom-out="handleZoomOut"
  />
</template>
```

---

## 🎨 UI Components

### SearchBox
**Autocomplete search with filters**

```vue
<template>
  <SearchBox
    v-model="searchQuery"
    :filters="searchFilters"
    :suggestions="suggestions"
    @search="handleSearch"
    @filter-change="handleFilterChange"
  />
</template>
```

### FilterPanel
**Collapsible filter panel**

```vue
<template>
  <FilterPanel
    v-model="activeFilters"
    :categories="filterCategories"
    :is-expanded="isFilterExpanded"
    @apply="applyFilters"
    @reset="resetFilters"
  />
</template>
```

---

## 🔧 Composables

### useSentientMap
**Core map functionality with sentient features**

```javascript
import { useSentientMap } from '@/composables/engine/useSentientMap'

export default {
  setup() {
    const {
      // State
      map,
      isReady,
      venues,
      clusters,
      
      // Methods
      initializeMap,
      addVenueLayer,
      updateVenues,
      flyToVenue,
      setCurrentLocation,
      
      // Computed
      visibleVenues,
      mapBounds,
      userLocation
    } = useSentientMap()
    
    return {
      map,
      venues,
      flyToVenue
    }
  }
}
```

**Features:**
- 🧠 Sentient map behavior
- 📍 Real-time venue updates
- 🎯 Intelligent clustering
- 🚀 Performance optimization

### useServiceWorker
**Service worker management for tile caching**

```javascript
import { useServiceWorker } from '@/composables/useServiceWorker'

export default {
  setup() {
    const {
      isSupported,
      isRegistered,
      cacheStats,
      
      // Methods
      registerServiceWorker,
      precacheMapTiles,
      clearCache,
      measureCachePerformance
    } = useServiceWorker()
    
    onMounted(() => {
      registerServiceWorker()
    })
    
    return {
      cacheStats
    }
  }
}
```

### usePinAtlas
**Spritesheet optimization for pin rendering**

```javascript
import { usePinAtlas } from '@/composables/usePinAtlas'

export default {
  setup() {
    const {
      isInitialized,
      atlas,
      metrics,
      
      // Methods
      loadPin,
      generateAtlas,
      renderPin,
      preloadCommonPins
    } = usePinAtlas()
    
    // Preload common pins
    onMounted(async () => {
      await preloadCommonPins(commonPinUrls)
    })
    
    return {
      atlas,
      renderPin
    }
  }
}
```

### useClusterVirtualization
**Advanced cluster virtualization**

```javascript
import { useClusterVirtualization } from '@/composables/useClusterVirtualization'

export default {
  setup() {
    const {
      isInitialized,
      virtualizedClusters,
      metrics,
      
      // Methods
      initializeVirtualization,
      addCluster,
      updateVisibleClusters,
      mergeNearbyClusters
    } = useClusterVirtualization()
    
    return {
      virtualizedClusters,
      metrics
    }
  }
}
```

---

## 🛠️ Utilities

### MapUtils
**Map calculation utilities**

```javascript
import { MapUtils } from '@/utils/mapUtils'

// Calculate distance between points
const distance = MapUtils.distance(
  [lat1, lng1],
  [lat2, lng2],
  'kilometers'
)

// Convert coordinates to pixels
const pixels = MapUtils.projectToScreen([lat, lng], zoom)

// Generate bounds for points
const bounds = MapUtils.boundsFromPoints(venues)
```

### VenueUtils
**Venue data processing**

```javascript
import { VenueUtils } from '@/utils/venueUtils'

// Filter venues by category
const restaurants = VenueUtils.filterByCategory(venues, 'restaurant')

// Sort by rating
const topRated = VenueUtils.sortBy(venues, 'rating', 'desc')

// Search venues
const results = VenueUtils.search(venues, query, filters)
```

---

## 🔗 Integration Examples

### Complete Map Implementation

```vue
<template>
  <div class="vibecity-container">
    <!-- Header with search -->
    <Header>
      <SearchBox
        v-model="searchQuery"
        @search="handleSearch"
      />
    </Header>
    
    <!-- Main map area -->
    <main class="map-container">
      <VibeMap
        ref="mapRef"
        :initial-center="mapCenter"
        :enable-clustering="true"
        @map-ready="handleMapReady"
        @venue-click="handleVenueClick"
      />
      
      <!-- Map controls overlay -->
      <MapControls
        :show-location="true"
        @location-request="handleLocationRequest"
      />
    </main>
    
    <!-- Filter panel -->
    <aside class="filter-panel">
      <FilterPanel
        v-model="activeFilters"
        @apply="applyFilters"
      />
    </aside>
    
    <!-- Venue drawer -->
    <VenueDrawer
      :venue="selectedVenue"
      :is-open="isDrawerOpen"
      @close="closeDrawer"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { VibeMap, MapControls, VenueDrawer, SearchBox, FilterPanel } from '@/components'
import { useSentientMap, useServiceWorker, usePinAtlas } from '@/composables'

// Map functionality
const {
  map,
  venues,
  flyToVenue,
  addVenueLayer
} = useSentientMap()

// Service worker for performance
const { registerServiceWorker, precacheMapTiles } = useServiceWorker()

// Pin atlas for rendering
const { preloadCommonPins } = usePinAtlas()

// Local state
const mapRef = ref(null)
const searchQuery = ref('')
const selectedVenue = ref(null)
const isDrawerOpen = ref(false)
const activeFilters = ref({})
const mapCenter = ref([13.7563, 100.5018])

// Computed properties
const filteredVenues = computed(() => {
  return venues.value.filter(venue => {
    return matchesSearch(venue, searchQuery.value) &&
           matchesFilters(venue, activeFilters.value)
  })
})

// Event handlers
const handleMapReady = async (mapInstance) => {
  map.value = mapInstance
  
  // Initialize map features
  await addVenueLayer(filteredVenues.value)
  
  // Preload map tiles for current viewport
  await precacheMapTiles(mapInstance.getBounds())
}

const handleVenueClick = (venue) => {
  selectedVenue.value = venue
  isDrawerOpen.value = true
}

const handleSearch = (query) => {
  searchQuery.value = query
  // Update venue layer with filtered results
  addVenueLayer(filteredVenues.value)
}

const handleLocationRequest = async () => {
  // Get user location and fly to it
  const position = await getCurrentPosition()
  flyToVenue({ lat: position.lat, lng: position.lng })
}

const applyFilters = (filters) => {
  activeFilters.value = filters
  addVenueLayer(filteredVenues.value)
}

const closeDrawer = () => {
  isDrawerOpen.value = false
  selectedVenue.value = null
}

// Initialize on mount
onMounted(async () => {
  await registerServiceWorker()
  await preloadCommonPins(getCommonPinUrls())
})
</script>

<style scoped>
.vibecity-container {
  display: grid;
  grid-template-areas: 
    "header header"
    "filters map"
    "drawer drawer";
  grid-template-columns: 300px 1fr;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
}

.map-container {
  grid-area: map;
  position: relative;
}

.filter-panel {
  grid-area: filters;
  background: var(--surface-color);
  border-right: 1px solid var(--border-color);
}

@media (max-width: 768px) {
  .vibecity-container {
    grid-template-areas: 
      "header"
      "map"
      "filters"
      "drawer";
    grid-template-columns: 1fr;
  }
  
  .filter-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
  }
}
</style>
```

---

## ⚡ Performance Guidelines

### 1. Lazy Loading
```vue
<!-- Good: Lazy load heavy components -->
<template>
  <Suspense>
    <template #default>
      <HeavyMapComponent />
    </template>
    <template #fallback>
      <MapSkeleton />
    </template>
  </Suspense>
</template>
```

### 2. Virtualization
```javascript
// Use cluster virtualization for large datasets
const { virtualizedClusters } = useClusterVirtualization()

// Only render visible clusters
const visibleClusters = computed(() => {
  return virtualizedClusters.value.filter(cluster => cluster.visible)
})
```

### 3. Caching
```javascript
// Use service worker for tile caching
const { precacheMapTiles } = useServiceWorker()

// Preload tiles for user's current area
await precacheMapTiles(currentBounds)
```

### 4. Memory Management
```javascript
// Cleanup unused resources
onUnmounted(() => {
  // Clear event listeners
  map.value.off('moveend', handleMove)
  
  // Dispose of WebGL resources
  if (texture) {
    gl.deleteTexture(texture)
  }
})
```

---

## ♿ Accessibility Standards

### 1. Keyboard Navigation
```vue
<template>
  <button
    @click="handleAction"
    @keydown.enter="handleAction"
    @keydown.space="handleAction"
    :aria-label="buttonLabel"
    :tabindex="isInteractive ? 0 : -1"
  >
    <span class="sr-only">{{ buttonLabel }}</span>
  </button>
</template>
```

### 2. Screen Reader Support
```vue
<template>
  <div
    role="application"
    aria-label="Interactive map showing venues"
    aria-describedby="map-instructions"
  >
    <div id="map-instructions" class="sr-only">
      Use arrow keys to navigate, Enter to select venues
    </div>
    
    <VibeMap
      :aria-label="'Map showing ' + venueCount + ' venues'"
      role="img"
    />
  </div>
</template>
```

### 3. Reduced Motion
```css
/* Respect user's motion preferences */
@media (prefers-reduced-motion: reduce) {
  .venue-marker {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## 🧪 Testing Guidelines

### 1. Unit Testing
```javascript
// Example: VenueMarker.test.js
import { mount } from '@vue/test-utils'
import { VenueMarker } from '@/components/VenueMarker.vue'

describe('VenueMarker', () => {
  it('renders venue data correctly', () => {
    const venue = { id: '1', name: 'Test Venue', lat: 13.7563, lng: 100.5018 }
    
    const wrapper = mount(VenueMarker, {
      props: { venue }
    })
    
    expect(wrapper.find('.venue-name').text()).toBe('Test Venue')
    expect(wrapper.find('.venue-marker').exists()).toBe(true)
  })
  
  it('emits click event', async () => {
    const venue = { id: '1', name: 'Test Venue' }
    
    const wrapper = mount(VenueMarker, {
      props: { venue }
    })
    
    await wrapper.find('.venue-marker').trigger('click')
    
    expect(wrapper.emitted().click).toBeTruthy()
    expect(wrapper.emitted().click[0][0]).toEqual(venue)
  })
})
```

### 2. E2E Testing
```javascript
// Example: map.spec.js
import { test, expect } from '@playwright/test'

test('map loads and displays venues', async ({ page }) => {
  await page.goto('/')
  
  // Wait for map to load
  await page.waitForSelector('.maplibregl-map')
  
  // Check for venue markers
  const markers = page.locator('[data-testid="venue-marker"]')
  await expect(markers).toHaveCount.greaterThan(0)
  
  // Test venue interaction
  await markers.first().click()
  await expect(page.locator('[data-testid="venue-drawer"]')).toBeVisible()
})
```

### 3. Visual Testing
```javascript
// Example: visual.spec.js
import { test, expect } from '@playwright/test'

test('map renders consistently', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.maplibregl-map')
  
  // Compare with baseline screenshot
  await expect(page.locator('.map-container')).toHaveScreenshot('map-baseline.png')
})
```

---

## 📚 Additional Resources

### API Documentation
- [Mapbox GL JS API](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Vue 3 Documentation](https://vuejs.org/guide/)
- [Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)

### Performance Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse/)
- [Vue DevTools](https://devtools.vuejs.org/)
- [Chrome DevTools Performance](https://developers.google.com/web/tools/chrome-devtools/evaluate-performance/)

### Accessibility Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## 🤝 Contributing Guidelines

### Component Standards
1. **TypeScript Required**: All components must have full type definitions
2. **Composition API**: Use `<script setup>` syntax
3. **Props Validation**: Define props with TypeScript interfaces
4. **Event Naming**: Use kebab-case for event names
5. **CSS Organization**: Use CSS custom properties for theming

### Testing Requirements
1. **Unit Tests**: Minimum 80% code coverage
2. **E2E Tests**: Critical user paths covered
3. **Visual Tests**: Component snapshots for regression testing
4. **Accessibility Tests**: axe-core integration required

### Documentation Standards
1. **JSDoc Comments**: Document all public methods
2. **Example Code**: Provide working examples
3. **Props Table**: Document all props with types and defaults
4. **Events Table**: Document all emitted events

---

> 📖 **This documentation is maintained alongside the codebase**  
> Last updated: March 2026  
> Version: 1.0.0  
> For questions, contact the development team or create an issue in the repository.
