# VibeCity Frontend Architecture Guide

This document describes the frontend architecture, component structure, and best practices for the VibeCity entertainment map application.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Technology Stack](#technology-stack)
3. [Component Architecture](#component-architecture)
4. [State Management](#state-management)
5. [Styling System](#styling-system)
6. [Accessibility Standards](#accessibility-standards)
7. [Performance Optimization](#performance-optimization)
8. [Development Workflow](#development-workflow)

---

## Project Structure

```
src/
├── components/          # Vue components organized by feature
│   ├── admin/          # Admin panel components
│   ├── dashboard/      # Merchant/partner dashboard
│   ├── design-system/  # Reusable UI primitives & compositions
│   ├── feed/           # Content feed and card components
│   ├── layout/         # Layout components (header, sidebar, nav)
│   ├── map/            # Mapbox integration and map layers
│   ├── modal/          # Modal and drawer components
│   ├── panel/          # Floating panels and cards
│   ├── pwa/            # PWA and service worker related
│   ├── system/         # System-level components (modals, notifications)
│   ├── transport/      # Ride-hailing integration UI
│   ├── ugc/            # User-generated content components
│   └── ui/             # General UI components
├── composables/        # Vue 3 Composition API utilities
├── config/             # Configuration files
├── design-system/      # Design tokens and theme
├── lib/                # Utility libraries
├── locales/            # i18n translation files
├── router/             # Vue Router configuration
├── store/              # Pinia state stores
├── schemas/            # Zod validation schemas
├── services/           # API clients and external services
├── App.vue             # Root component
├── main.js             # Application entry point
├── i18n.js             # i18n setup
├── style.css           # Global styles (minimal)
└── sw.js               # Service worker
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Vue 3 | 3.5.24 |
| **Build Tool** | Rsbuild | 1.7.2 |
| **Styling** | Tailwind CSS | 3.4.19 |
| **State Management** | Pinia | 3.0.4 |
| **Routing** | Vue Router | 4.6.4 |
| **Data Fetching** | TanStack Vue Query | 5.92.8 |
| **Internationalization** | vue-i18n | 9.14.5 |
| **Icons** | Lucide Icons | 0.562.0 |
| **Maps** | Mapbox GL | 3.18.0 |
| **Animations** | Lottie Web | 5.13.0 |
| **Code Quality** | Biome | 2.3.11 |
| **Testing** | Playwright, Vitest | Latest |
| **PWA** | Workbox | 7.4.0 |

---

## Component Architecture

### Component Hierarchy

Components are organized by scope and responsibility:

```
App.vue (Root)
├── ReloadPrompt (PWA)
├── ConsentBanner (Privacy)
├── router-view
│   ├── HomeView
│   │   ├── SmartHeader
│   │   ├── MapboxContainer
│   │   ├── BottomFeed
│   │   └── SideBar
│   ├── PartnerDashboard
│   ├── AdminView
│   └── ...other views
└── VibeNotification (Toast)
```

### Component Categories

#### 1. **Design System Components** (`src/components/design-system/`)

Reusable primitives and composition patterns:

- **Primitives**: `ActionBtn.vue`, base components with zero styling assumptions
- **Compositions**: `PlaceCard.vue`, higher-level assembled components
- **Utilities**: Common UI patterns extracted for reuse

**Usage Pattern:**
```vue
<script setup>
import ActionBtn from '@/components/design-system/primitives/ActionBtn.vue'
</script>

<template>
  <ActionBtn variant="primary" size="lg" @click="handleClick">
    Click me
  </ActionBtn>
</template>
```

#### 2. **Feature Components**

Components tied to specific features (map, feed, dashboard, etc.):

- Should have a single responsibility
- Can compose design system components
- Handle their own loading/error states
- Use feature-specific stores

**Example Structure:**
```vue
<script setup>
import { useAsyncState } from '@/composables/useAsyncState'
import { useFeedStore } from '@/store/feedStore'

const feedStore = useFeedStore()
const { isLoading, error, data, execute } = useAsyncState(
  () => feedStore.fetchFeed()
)
</script>

<template>
  <div v-if="isLoading" class="loading-skeleton" />
  <div v-else-if="error" class="error-state">
    <button @click="execute">Retry</button>
  </div>
  <div v-else class="feed-list">
    <!-- render data -->
  </div>
</template>
```

#### 3. **Container Components**

Page-level components that orchestrate multiple feature components:

- Manage route parameters
- Coordinate between stores
- Handle page-level state
- Pass data to child components via props

---

## State Management

### Pinia Stores

Store structure follows feature-based organization:

```javascript
// src/store/feedStore.js
export const useFeedStore = defineStore('feed', {
  state: () => ({
    items: [],
    filters: {},
  }),
  
  getters: {
    filteredItems: (state) => /* computed */ ,
  },
  
  actions: {
    async fetchFeed() { /* ... */ },
    async addItem(item) { /* ... */ },
  },
})
```

### Store Naming Convention

- `useXxxStore` for store composable (e.g., `useFeedStore`)
- Feature-focused: `feedStore`, `shopStore`, `userStore`
- Not generic: avoid `useGlobalStore`, `useDataStore`

### Persistence

Stores using `pinia-plugin-persistedstate` automatically persist:

```javascript
export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    items: [],
  }),
  persist: true, // Saves to localStorage
})
```

---

## Styling System

### Design Tokens

All colors, spacing, shadows, etc. are defined as CSS variables in:

```
src/design-system/tokens.css
```

Variables are prefixed with `--vc-` (VibeCity):

```css
:root {
  --vc-color-brand-primary: #00f0ff;
  --vc-space-16: 16px;
  --vc-radius-card: 16px;
  --vc-shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.37);
}
```

### Tailwind Classes

Use Tailwind classes for layout and responsive design:

```vue
<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
    <div class="rounded-lg bg-surface-glass border border-white/10">
      Content
    </div>
  </div>
</template>
```

### Custom Classes

For complex, reusable styles, use scoped styles or PostCSS:

```vue
<style scoped>
.glass-card {
  background: var(--vc-color-surface-glass);
  border: 1px solid var(--vc-color-border-glass);
  border-radius: var(--vc-radius-card);
  backdrop-filter: blur(20px);
}
</style>
```

---

## Accessibility Standards

All components must meet **WCAG 2.1 Level AA** standards.

### Key Principles

1. **Semantic HTML**: Use native elements (button, nav, form, etc.)
2. **ARIA Labels**: Label interactive elements
   ```vue
   <button :aria-label="t('common.close')" @click="close">
     <X aria-hidden="true" />
   </button>
   ```

3. **Keyboard Navigation**: All interactive elements must be keyboard accessible
4. **Motion Preferences**: Respect `prefers-reduced-motion`
   ```javascript
   import { useMotionPreference } from '@/composables/useMotionPreference'
   
   const { shouldReduceMotion } = useMotionPreference()
   ```

5. **Focus Management**: Visible focus indicators
6. **Color Contrast**: Minimum AA contrast ratio (4.5:1 for text)

### Focus Ring

Use the `.focus-ring` class or Tailwind's `focus-visible` for visible focus:

```vue
<button class="focus:outline-2 focus:outline-offset-2 focus:outline-blue-400">
  Interactive
</button>
```

### Screen Reader Support

```vue
<!-- Hide decorative icons -->
<Icon aria-hidden="true" />

<!-- Screen reader only text -->
<span class="sr-only">Loading venues...</span>

<!-- Live regions for dynamic updates -->
<div aria-live="polite" aria-busy="isLoading">
  {{ statusMessage }}
</div>
```

---

## Performance Optimization

### Code Splitting

Rsbuild automatically splits chunks by:

1. **Route-based**: Each route is lazy-loaded
2. **Vendor splitting**: Heavy libraries (Mapbox, Vue, Pinia) in separate chunks
3. **Manual chunks**: Configured in `rsbuild.config.ts`

### Image Optimization

1. Use Mapbox tiles for map layer images
2. Use stock images from CDN (e.g., `https://picsum.photos/`)
3. Lazy-load images in feeds with `v-lazy` or Intersection Observer

### Bundle Analysis

```bash
# Generate bundle analysis report
ANALYZE=true bun run build

# Open dist/stats.html to visualize bundle
```

### Lazy Loading Components

```vue
<script setup>
const HeavyComponent = defineAsyncComponent(() =>
  import('@/components/HeavyComponent.vue')
)
</script>

<template>
  <Suspense>
    <HeavyComponent />
    <template #fallback>
      <LoadingSpinner />
    </template>
  </Suspense>
</template>
```

### Query Optimization

Use TanStack Query (Vue Query) for efficient data fetching:

```javascript
import { useQuery } from '@tanstack/vue-query'

const { data, isLoading, error } = useQuery({
  queryKey: ['venues'],
  queryFn: () => api.getVenues(),
  staleTime: 5 * 60 * 1000, // 5 minutes
})
```

---

## Development Workflow

### Local Development

```bash
# Install dependencies
bun install

# Start dev server (http://localhost:5173)
bun run dev

# Check code quality
bun run check

# Run tests
bun run test:unit
bun run test:e2e

# Build for production
bun run build
```

### Git Workflow

1. Create feature branch: `git checkout -b feat/feature-name`
2. Make changes following coding guidelines
3. Check code quality: `bun run check`
4. Commit with descriptive message: `git commit -m "feat: add feature description"`
5. Push and create Pull Request

### Code Quality

- **Biome**: Automatic formatting and linting
- **Vitest**: Unit testing
- **Playwright**: E2E testing
- **Bundle Analysis**: Monitor chunk sizes

### Responsive Design

Test at common breakpoints:

| Device | Breakpoint | Testing |
|--------|-----------|---------|
| Mobile (small) | 375px | iPhone SE |
| Mobile (large) | 768px | iPad |
| Tablet | 1024px | iPad Pro |
| Desktop | 1280px+ | Desktop |

Use Tailwind breakpoints:
```vue
<div class="text-sm md:text-base lg:text-lg">
  Responsive text
</div>
```

---

## Best Practices

### ✅ DO

- Keep components small and focused
- Use composition API with `<script setup>`
- Leverage design system components
- Follow naming conventions
- Add ARIA labels to interactive elements
- Test accessibility with keyboard navigation
- Use TanStack Query for data fetching
- Respect motion preferences

### ❌ DON'T

- Don't hardcode colors; use design tokens
- Don't create large monolithic components
- Don't forget accessibility (ARIA, keyboard nav)
- Don't use inline styles
- Don't ignore error states
- Don't forget loading indicators
- Don't use generic class names
- Don't forget responsive design

---

## Resources

- [Vue 3 Documentation](https://vuejs.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [Rsbuild Documentation](https://rsbuild.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Accessible Patterns](https://www.a11y-101.com/)

