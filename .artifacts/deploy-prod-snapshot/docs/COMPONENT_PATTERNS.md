# Component Patterns & Best Practices

Common patterns and examples for building VibeCity components.

## Table of Contents

1. [Loading States](#loading-states)
2. [Error Handling](#error-handling)
3. [Form Patterns](#form-patterns)
4. [Modal Patterns](#modal-patterns)
5. [List Patterns](#list-patterns)

---

## Loading States

### Pattern: useAsyncState

Use the `useAsyncState` composable for consistent loading state management:

```vue
<script setup>
import { useAsyncState } from '@/composables/useAsyncState'
import { useShopStore } from '@/store/shopStore'

const shopStore = useShopStore()

const { 
  isLoading,
  isError,
  error,
  data,
  execute,
  retry 
} = useAsyncState(() => shopStore.fetchShops())

// Fetch immediately when component mounts
onMounted(() => execute())
</script>

<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="isLoading" class="space-y-3">
      <div class="h-20 bg-zinc-800 rounded-lg animate-pulse" />
      <div class="h-20 bg-zinc-800 rounded-lg animate-pulse" />
    </div>

    <!-- Error state -->
    <div v-else-if="isError" class="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
      <p class="text-red-400 font-medium">{{ error.message }}</p>
      <button @click="retry" class="mt-2 px-4 py-2 bg-red-500 rounded">
        Try Again
      </button>
    </div>

    <!-- Success state -->
    <div v-else class="space-y-2">
      <div v-for="shop in data" :key="shop.id" class="p-4 border rounded">
        {{ shop.name }}
      </div>
    </div>
  </div>
</template>
```

### Pattern: TanStack Query

For complex queries with caching and background updates:

```vue
<script setup>
import { useQuery } from '@tanstack/vue-query'
import { api } from '@/services/api'

const { 
  data: shops,
  isLoading,
  isError,
  error,
  refetch 
} = useQuery({
  queryKey: ['shops'],
  queryFn: () => api.getShops(),
  staleTime: 5 * 60 * 1000,        // 5 minutes
  gcTime: 10 * 60 * 1000,          // 10 minutes
  retry: 2,
  retryDelay: (attempt) => 1000 * attempt,
})
</script>

<template>
  <div>
    <Suspense>
      <ShopList v-if="shops" :shops="shops" />
      <template #fallback>
        <LoadingSkeleton />
      </template>
    </Suspense>
  </div>
</template>
```

---

## Error Handling

### Pattern: Error Boundaries

Wrap feature components with error boundaries:

```vue
<!-- Parent view -->
<script setup>
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue'
import FeedComponent from '@/components/feed/FeedComponent.vue'
</script>

<template>
  <ErrorBoundary>
    <FeedComponent />
  </ErrorBoundary>
</template>
```

### Pattern: User-Friendly Errors

Always show user-friendly error messages:

```javascript
// ❌ Bad: Generic error
catch (err) {
  console.error(err)
}

// ✅ Good: User-friendly error
catch (err) {
  const userMessage = err.response?.data?.message 
    || 'Failed to load. Please try again.'
  useNotifications().notifyError(userMessage)
}
```

### Pattern: Error Recovery

Provide recovery mechanisms:

```vue
<script setup>
const { isError, error, retry } = useAsyncState(fetchData)
</script>

<template>
  <div v-if="isError" class="error-box">
    <h3>Something went wrong</h3>
    <p>{{ error.message }}</p>
    <div class="flex gap-2">
      <button @click="retry" class="btn btn-primary">
        Try Again
      </button>
      <button @click="navigateTo('/')" class="btn btn-secondary">
        Go Home
      </button>
    </div>
  </div>
</template>
```

---

## Form Patterns

### Pattern: Form with Validation

```vue
<script setup>
import { useForm } from '@/composables/useForm'
import { shopSchema } from '@/schemas'

const { values, errors, isSubmitting, handleSubmit } = useForm({
  initialValues: {
    name: '',
    description: '',
  },
  validationSchema: shopSchema,
  onSubmit: async (values) => {
    await shopStore.createShop(values)
    router.push('/shops')
  },
})
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="form-group">
      <label for="name">Shop Name *</label>
      <input
        id="name"
        v-model="values.name"
        type="text"
        required
        aria-required="true"
        :aria-invalid="!!errors.name"
        :aria-describedby="errors.name ? 'name-error' : undefined"
      />
      <span v-if="errors.name" id="name-error" class="error-message">
        {{ errors.name }}
      </span>
    </div>

    <button type="submit" :disabled="isSubmitting">
      {{ isSubmitting ? 'Saving...' : 'Save' }}
    </button>
  </form>
</template>

<style scoped>
.form-group {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}

label {
  font-weight: 500;
  margin-bottom: 0.5rem;
}

input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

input[aria-invalid="true"] {
  border-color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

.error-message {
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
</style>
```

---

## Modal Patterns

### Pattern: Simple Modal

```vue
<script setup>
import { ref } from 'vue'

const isOpen = ref(false)

const open = () => {
  isOpen.value = true
}

const close = () => {
  isOpen.value = false
}
</script>

<template>
  <div>
    <button @click="open">Open Modal</button>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          @click="close"
        >
          <div
            class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6"
            @click.stop
          >
            <h2 class="text-lg font-bold mb-4">Modal Title</h2>
            <p class="text-gray-600 mb-6">Modal content goes here</p>
            
            <div class="flex gap-2 justify-end">
              <button @click="close" class="btn btn-secondary">
                Cancel
              </button>
              <button @click="handleConfirm" class="btn btn-primary">
                Confirm
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

---

## List Patterns

### Pattern: Virtual Scroll for Large Lists

```vue
<script setup>
import { VirtualScroller } from 'vue-virtual-scroller'
import { useQuery } from '@tanstack/vue-query'

const { data: items } = useQuery({
  queryKey: ['venues'],
  queryFn: () => api.getVenues(),
})
</script>

<template>
  <VirtualScroller
    :items="items"
    :item-size="80"
    class="h-96"
  >
    <template #default="{ item }">
      <VenueCard :venue="item" class="p-4 border-b" />
    </template>
  </VirtualScroller>
</template>
```

### Pattern: Infinite Scroll with Pagination

```vue
<script setup>
import { useInfiniteQuery } from '@tanstack/vue-query'
import { useIntersectionObserver } from '@vueuse/core'

const { 
  data,
  isLoading,
  hasNextPage,
  fetchNextPage 
} = useInfiniteQuery({
  queryKey: ['venues'],
  queryFn: ({ pageParam = 0 }) => 
    api.getVenues({ page: pageParam }),
  getNextPageParam: (lastPage, pages) =>
    lastPage.hasMore ? pages.length : undefined,
})

const loadMoreEl = ref(null)
useIntersectionObserver(loadMoreEl, ([{ isVisible }]) => {
  if (isVisible && hasNextPage && !isLoading.value) {
    fetchNextPage()
  }
})
</script>

<template>
  <div>
    <div v-for="page in data?.pages" :key="page.id" class="space-y-4">
      <VenueCard
        v-for="venue in page.items"
        :key="venue.id"
        :venue="venue"
      />
    </div>

    <div
      ref="loadMoreEl"
      v-if="hasNextPage"
      class="h-20 flex items-center justify-center"
    >
      <LoadingSpinner />
    </div>
  </div>
</template>
```

### Pattern: Filtered List

```vue
<script setup>
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'

const searchQuery = ref('')
const selectedCategory = ref(null)

const { data: venues } = useQuery({
  queryKey: ['venues', { category: selectedCategory }],
  queryFn: () => api.getVenues({ 
    category: selectedCategory.value 
  }),
})

const filtered = computed(() => {
  if (!venues.value) return []
  return venues.value.filter(v =>
    v.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})
</script>

<template>
  <div>
    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search venues..."
      class="w-full p-2 border rounded"
    />

    <div class="flex gap-2 my-4">
      <button
        v-for="cat in categories"
        :key="cat.id"
        :aria-pressed="selectedCategory === cat.id"
        @click="selectedCategory = selectedCategory === cat.id ? null : cat.id"
      >
        {{ cat.name }}
      </button>
    </div>

    <div class="space-y-4">
      <VenueCard
        v-for="venue in filtered"
        :key="venue.id"
        :venue="venue"
      />
    </div>
  </div>
</template>
```

---

## Responsive Pattern

```vue
<script setup>
import { useWindowSize } from '@vueuse/core'

const { width } = useWindowSize()

const isMobile = computed(() => width.value < 768)
const isTablet = computed(() => width.value >= 768 && width.value < 1024)
const isDesktop = computed(() => width.value >= 1024)
</script>

<template>
  <!-- Mobile layout -->
  <div v-if="isMobile" class="mobile-layout">
    <MobileMenu />
    <MobileContent />
  </div>

  <!-- Tablet layout -->
  <div v-else-if="isTablet" class="tablet-layout">
    <TabletSidebar />
    <TabletContent />
  </div>

  <!-- Desktop layout -->
  <div v-else class="desktop-layout">
    <DesktopSidebar />
    <DesktopContent />
  </div>
</template>
```

---

## Animation Pattern

```vue
<script setup>
import { useMotionPreference } from '@/composables/useMotionPreference'

const { shouldReduceMotion, getAnimationDuration } = useMotionPreference()
</script>

<template>
  <Transition
    :css="!shouldReduceMotion"
    :duration="getAnimationDuration(300)"
    name="fade"
  >
    <div v-if="isVisible" class="animated-content">
      Content
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

