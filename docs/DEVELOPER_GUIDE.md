# VibeCity Developer Guide

## 🎯 Introduction

This comprehensive guide helps developers understand, extend, and maintain the VibeCity platform.

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Testing Strategy](#testing-strategy)
6. [Performance Guidelines](#performance-guidelines)
7. [Security Best Practices](#security-best-practices)
8. [Debugging Tips](#debugging-tips)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

---

## 🚀 Getting Started

### Prerequisites

```bash
# Required
- Node.js >= 18.0.0
- Bun >= 1.0.0
- Git
- Python >= 3.8 (for validation scripts)

# Optional
- Docker (for containerized development)
- VS Code (recommended IDE)
```

### Initial Setup

```bash
# Clone repository
git clone https://github.com/vibecity/vibecity.git
cd vibecity

# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
bun run dev

# Run tests
bun test

# Validate everything
python .agent/scripts/checklist.py .
```

### Project Structure

```
vibecity/
├── src/
│   ├── api/              # API clients
│   ├── assets/           # Static assets
│   ├── components/       # Vue components
│   ├── composables/      # Vue composables
│   │   └── map/         # Map-specific composables
│   ├── layouts/          # Layout components
│   ├── pages/            # Page components
│   ├── plugins/          # Vue plugins
│   ├── router/           # Vue Router config
│   ├── stores/           # Pinia stores
│   ├── styles/           # Global styles
│   └── utils/            # Utility functions
│       ├── performance/  # Performance utilities
│       ├── security/     # Security utilities
│       ├── analytics/    # Analytics utilities
│       ├── errorHandling/# Error handling
│       ├── monitoring/   # Health monitoring
│       └── pwa/         # PWA utilities
├── tests/
│   ├── unit/            # Unit tests
│   ├── e2e/             # E2E tests
│   └── fixtures/        # Test fixtures
├── docs/                # Documentation
├── .agent/              # AI agent configuration
│   ├── agents/          # Specialized agents
│   ├── skills/          # Agent skills
│   └── scripts/         # Validation scripts
└── public/              # Public assets
```

---

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────┐
│         User Interface Layer            │
│  (Vue 3 Components + Composition API)   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│        Application Layer                │
│  (Composables, Stores, Router)          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Integration Layer               │
│  (Plugins: Phase1, Master)              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│          Utility Layer                  │
│  (Performance, Security, Analytics)     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         External Services               │
│  (Supabase, MapLibre, Analytics)        │
└─────────────────────────────────────────┘
```

### Data Flow

```
User Action
    ↓
Component Event
    ↓
Composable Logic
    ↓
Store Update (if needed)
    ↓
API Call (if needed)
    ↓
Response Processing
    ↓
UI Update
    ↓
Analytics Tracking
```

### Key Design Patterns

1. **Composition API Pattern**
   - Use composables for reusable logic
   - Keep components focused on presentation
   - Share state through Pinia stores

2. **Plugin Architecture**
   - Modular feature integration
   - Phase-based activation
   - Configuration-driven behavior

3. **Error Boundary Pattern**
   - Graceful error handling
   - Automatic recovery
   - User-friendly fallbacks

4. **Performance Monitoring Pattern**
   - Continuous FPS tracking
   - Adaptive quality settings
   - Memory pressure detection

---

## 💻 Development Workflow

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Develop feature
# - Write code
# - Add tests
# - Update documentation

# 3. Run validation
python .agent/scripts/checklist.py .

# 4. Commit changes
git add .
git commit -m "feat: add your feature"

# 5. Push and create PR
git push origin feature/your-feature-name
```

### Commit Message Convention

```
<type>(<scope>): <subject>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code restructuring
- test: Adding tests
- chore: Maintenance

Examples:
feat(map): add 3D building layer
fix(auth): resolve token refresh issue
docs(api): update API documentation
```

### Code Review Checklist

- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No ungated console.log statements
- [ ] Error handling implemented
- [ ] Performance considered
- [ ] Security reviewed
- [ ] Accessibility checked
- [ ] Mobile responsive
- [ ] Browser compatibility

---

## 📝 Code Standards

### Vue Component Structure

```vue
<script setup>
// 1. Imports
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

// 2. Props
const props = defineProps({
  title: {
    type: String,
    required: true,
  },
});

// 3. Emits
const emit = defineEmits(['update', 'close']);

// 4. Composables
const router = useRouter();

// 5. Reactive state
const isLoading = ref(false);
const data = ref(null);

// 6. Computed properties
const displayTitle = computed(() => props.title.toUpperCase());

// 7. Methods
const handleClick = () => {
  emit('update', data.value);
};

// 8. Lifecycle hooks
onMounted(() => {
  // Initialize
});
</script>

<template>
  <div class="component">
    <h1>{{ displayTitle }}</h1>
    <button @click="handleClick">Click</button>
  </div>
</template>

<style scoped>
.component {
  /* Styles */
}
</style>
```

### Composable Structure

```javascript
/**
 * useFeature - Description
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} - Composable API
 */
export function useFeature(options = {}) {
  // 1. Reactive state
  const state = ref(null);
  
  // 2. Computed properties
  const computed = computed(() => state.value);
  
  // 3. Methods
  const method = () => {
    // Implementation
  };
  
  // 4. Lifecycle
  onMounted(() => {
    // Setup
  });
  
  onUnmounted(() => {
    // Cleanup
  });
  
  // 5. Return API
  return {
    state,
    computed,
    method,
  };
}
```

### Naming Conventions

```javascript
// Components: PascalCase
MyComponent.vue

// Composables: camelCase with 'use' prefix
useMapFeatures.js

// Utilities: camelCase
formatDate.js

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Private variables: underscore prefix
const _internalState = {};

// Boolean variables: is/has/should prefix
const isLoading = ref(false);
const hasError = ref(false);
const shouldUpdate = computed(() => true);
```

---

## 🧪 Testing Strategy

### Test Structure

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MyComponent from '@/components/MyComponent.vue';

describe('MyComponent', () => {
  let wrapper;
  
  beforeEach(() => {
    wrapper = mount(MyComponent, {
      props: {
        title: 'Test',
      },
    });
  });
  
  afterEach(() => {
    wrapper.unmount();
  });
  
  it('renders correctly', () => {
    expect(wrapper.find('h1').text()).toBe('Test');
  });
  
  it('handles click event', async () => {
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('update')).toBeTruthy();
  });
});
```

### Testing Best Practices

1. **Unit Tests**
   - Test one thing at a time
   - Mock external dependencies
   - Use descriptive test names
   - Aim for 80%+ coverage

2. **Integration Tests**
   - Test component interactions
   - Test data flow
   - Test error scenarios
   - Test edge cases

3. **E2E Tests**
   - Test critical user flows
   - Test on multiple browsers
   - Test mobile responsiveness
   - Test accessibility

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun test --watch

# Coverage
bun run test:unit:coverage

# Specific file
bunx vitest run tests/unit/MyComponent.spec.js

# E2E tests
bun run test:e2e

# Validation
python .agent/scripts/checklist.py .
```

---

## ⚡ Performance Guidelines

### Performance Budget

```javascript
// Target metrics
const PERFORMANCE_BUDGET = {
  FCP: 1800,  // First Contentful Paint (ms)
  LCP: 2500,  // Largest Contentful Paint (ms)
  FID: 100,   // First Input Delay (ms)
  CLS: 0.1,   // Cumulative Layout Shift
  TTI: 3800,  // Time to Interactive (ms)
  TBT: 300,   // Total Blocking Time (ms)
};
```

### Optimization Techniques

1. **Code Splitting**
```javascript
// Route-based splitting
const Home = () => import('@/pages/Home.vue');
const Map = () => import('@/pages/Map.vue');

// Component-based splitting
const HeavyComponent = defineAsyncComponent(() =>
  import('@/components/HeavyComponent.vue')
);
```

2. **Lazy Loading**
```vue
<template>
  <img v-lazy-image="imageUrl" alt="Description" />
</template>
```

3. **Memoization**
```javascript
const expensiveComputed = computed(() => {
  // Cache expensive calculations
  return heavyCalculation(props.data);
});
```

4. **Debouncing/Throttling**
```javascript
import { useDebounceFn, useThrottleFn } from '@vueuse/core';

const debouncedSearch = useDebounceFn((query) => {
  // Search logic
}, 300);

const throttledScroll = useThrottleFn(() => {
  // Scroll logic
}, 100);
```

### Performance Monitoring

```javascript
import { usePerformanceMonitor } from '@/utils/performance/performanceMonitor';

const perfMonitor = usePerformanceMonitor();

// Start monitoring
perfMonitor.start();

// Track custom metric
perfMonitor.trackMetric('custom_metric', value);

// Get current metrics
const metrics = perfMonitor.getMetrics();
```

---

## 🔒 Security Best Practices

### Input Sanitization

```javascript
import { sanitizeInput } from '@/utils/security/inputSanitizer';

// Sanitize user input
const cleanInput = sanitizeInput(userInput, {
  allowHTML: false,
  maxLength: 1000,
});
```

### XSS Prevention

```vue
<template>
  <!-- Safe: Vue automatically escapes -->
  <div>{{ userInput }}</div>
  
  <!-- Dangerous: Only use with trusted content -->
  <div v-html="trustedHTML"></div>
  
  <!-- Safe: Use sanitizer -->
  <div v-html="sanitizeHTML(userHTML)"></div>
</template>
```

### CSRF Protection

```javascript
// API client automatically includes CSRF token
import { apiClient } from '@/api/client';

await apiClient.post('/api/endpoint', data);
// CSRF token included in headers
```

### Rate Limiting

```javascript
import { rateLimit } from '@/utils/security/rateLimit';

const limitedFunction = rateLimit(async () => {
  // API call
}, {
  maxCalls: 10,
  windowMs: 60000, // 1 minute
});
```

---

## 🐛 Debugging Tips

### Vue DevTools

```javascript
// Enable in development
if (import.meta.env.DEV) {
  app.config.performance = true;
}
```

### Console Debugging

```javascript
// Use debug utility
import { debug } from '@/utils/debug';

debug.log('Component mounted', { props, state });
debug.warn('Potential issue', { data });
debug.error('Error occurred', { error });
```

### Map And PWA Debug Flags

Map and PWA diagnostics are intentionally quiet by default. Use the shared flags below when you need deep runtime logging without reintroducing permanent console noise.

```javascript
// One-off toggles for the current page session
window.__VIBECITY_MAP_DEBUG = true;
window.__VIBECITY_PWA_DEBUG = true;
```

Use persistent flags when you need boot-time logs after a reload:

```javascript
// Persist until the tab is closed
sessionStorage.setItem('vibecity.debug.map', 'true');
sessionStorage.setItem('vibecity.debug.pwa', 'true');
location.reload();
```

```javascript
// Persist across browser restarts
localStorage.setItem('vibecity.debug.map', 'true');
localStorage.setItem('vibecity.debug.pwa', 'true');
location.reload();
```

Disable them when you're done:

```javascript
delete window.__VIBECITY_MAP_DEBUG;
delete window.__VIBECITY_PWA_DEBUG;
sessionStorage.removeItem('vibecity.debug.map');
sessionStorage.removeItem('vibecity.debug.pwa');
localStorage.removeItem('vibecity.debug.map');
localStorage.removeItem('vibecity.debug.pwa');
location.reload();
```

What each flag enables:

- `__VIBECITY_MAP_DEBUG` / `vibecity.debug.map`: map boot timing, GPU capability logs, optional layer diagnostics, route fallback warnings, OSM road fetch diagnostics, and neon sign helper installation logs.
- `__VIBECITY_PWA_DEBUG` / `vibecity.debug.pwa`: service worker registration, update checks, message flow, cache/sync lifecycle, and push notification diagnostics.

Expected network aborts are also normalized in the frontend service layer. Keep real failures as `console.error`, but route debug-only output through the shared helpers instead of adding raw `console.log` calls.

### Performance Profiling

```javascript
// Profile function execution
console.time('expensive-operation');
expensiveOperation();
console.timeEnd('expensive-operation');

// Profile component render
import { onRenderTracked, onRenderTriggered } from 'vue';

onRenderTracked((event) => {
  console.log('Tracked:', event);
});

onRenderTriggered((event) => {
  console.log('Triggered:', event);
});
```

### Network Debugging

```javascript
// Log API calls
import { apiClient } from '@/api/client';

apiClient.interceptors.request.use((config) => {
  console.log('Request:', config);
  return config;
});

apiClient.interceptors.response.use((response) => {
  console.log('Response:', response);
  return response;
});
```

---

## 🎨 Common Patterns

### Loading States

```vue
<script setup>
const { data, isLoading, error } = useAsyncData(fetchData);
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>{{ data }}</div>
</template>
```

### Error Handling

```javascript
try {
  await riskyOperation();
} catch (error) {
  // Log error
  console.error('Operation failed:', error);
  
  // Track error
  analytics.trackError(error);
  
  // Show user-friendly message
  toast.error('Something went wrong. Please try again.');
  
  // Attempt recovery
  await recoverFromError();
}
```

### Infinite Scroll

```javascript
import { useInfiniteScroll } from '@vueuse/core';

const { data, loadMore, hasMore } = useInfiniteData();

useInfiniteScroll(
  containerRef,
  () => {
    if (hasMore.value) {
      loadMore();
    }
  },
  { distance: 100 }
);
```

### Form Validation

```javascript
import { useForm } from '@/composables/useForm';

const { values, errors, validate, handleSubmit } = useForm({
  initialValues: {
    email: '',
    password: '',
  },
  validationSchema: {
    email: (value) => {
      if (!value) return 'Email is required';
      if (!isValidEmail(value)) return 'Invalid email';
      return null;
    },
    password: (value) => {
      if (!value) return 'Password is required';
      if (value.length < 8) return 'Password must be at least 8 characters';
      return null;
    },
  },
  onSubmit: async (values) => {
    await submitForm(values);
  },
});
```

---

## 🔧 Troubleshooting

### Common Issues

#### Build Errors

```bash
# Clear cache and rebuild
rm -rf node_modules .nuxt dist
bun install
bun run build
```

#### Test Failures

```bash
# Run tests in watch mode
bun test --watch

# Run specific test
bunx vitest run tests/unit/MyComponent.spec.js

# Clear test cache
bunx vitest run --clearCache
```

#### Performance Issues

```javascript
// Enable performance monitoring
import { usePerformanceMonitor } from '@/utils/performance/performanceMonitor';

const perfMonitor = usePerformanceMonitor();
perfMonitor.start();

// Check metrics
console.log(perfMonitor.getMetrics());
```

#### Memory Leaks

```javascript
// Always cleanup in onUnmounted
onUnmounted(() => {
  // Clear intervals
  clearInterval(intervalId);
  
  // Remove event listeners
  window.removeEventListener('resize', handleResize);
  
  // Cleanup subscriptions
  subscription.unsubscribe();
});
```

### Debug Mode

```bash
# Enable debug mode
VITE_DEBUG=true bun run dev

# Enable verbose logging
VITE_LOG_LEVEL=debug bun run dev
```

### Getting Help

1. Check documentation: `docs/INDEX.md`
2. Search issues: GitHub Issues
3. Ask in discussions: GitHub Discussions
4. Contact support: support@vibecity.live

---

## 📚 Additional Resources

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [MapLibre Documentation](https://maplibre.org/)
- [Supabase Documentation](https://supabase.com/docs)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.

---

**Last Updated**: 2024-03-15
**Version**: 1.0.0
