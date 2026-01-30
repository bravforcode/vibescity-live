<!-- src/components/layout/SmartHeader.vue -->
<script setup>
import { Coins, Menu, Search, SlidersHorizontal, X } from "lucide-vue-next";
import { useCoinStore } from "../../store/coinStore";

const props = defineProps({
  isVibeNowCollapsed: Boolean,
  isDarkMode: Boolean,
  globalSearchQuery: String,
  showSearchResults: Boolean,
  globalSearchResults: {
    type: Array,
    default: () => [],
  },
  t: Function,
  isImmersive: Boolean,
});

const emit = defineEmits([
  "open-sidebar",
  "open-filter",
  "update:globalSearchQuery",
  "update:showSearchResults",
  "select-search-result",
  "select-search-result",
  "haptic-tap",
]);

import { ref, watch } from "vue";

// Debounce Utility
const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const localSearchQuery = ref(props.globalSearchQuery);

// Sync local with prop if changed externally
watch(
  () => props.globalSearchQuery,
  (newVal) => {
    if (newVal !== localSearchQuery.value) {
      localSearchQuery.value = newVal;
    }
  },
);

const debouncedEmit = debounce((val) => {
  emit("update:globalSearchQuery", val);
}, 300); // 300ms delay

const handleSearchInput = (e) => {
  const val = e.target.value;
  localSearchQuery.value = val;
  debouncedEmit(val);
  debouncedEmit(val);
};

const coinStore = useCoinStore();
</script>

<template>
  <div
    data-testid="header"
    class="fixed top-0 left-0 right-0 z-[5000] flex flex-col pointer-events-none transition-transform duration-300"
    :class="isVibeNowCollapsed ? '-translate-y-full' : 'translate-y-0'"
  >
    <!-- Top Row: Hamburger + Search + Profile -->
    <div class="flex items-center gap-3 px-4 pt-4 pb-2">
      <!-- Hamburger - Premium Glass Button -->
      <button
        data-testid="btn-menu"
        aria-label="Open Menu"
        @click="
          emit('open-sidebar');
          emit('haptic-tap');
        "
        class="header-button group"
        :class="{ '!bg-white/10 !border-white/20': isImmersive }"
      >
        <Menu
          class="w-5 h-5 group-hover:rotate-180 transition-transform duration-500"
        />
      </button>

      <!-- Search Bar - Premium Glass Input -->
      <div class="flex-1 pointer-events-auto relative z-50">
        <div
          class="search-container group"
          :class="{ '!bg-white/10 !border-white/20': isImmersive }"
        >
          <Search
            class="w-4 h-4 text-white/50 group-focus-within:text-blue-400 mr-2 transition-colors duration-300"
          />
          <input
            data-testid="search-input"
            aria-label="Search venues"
            :value="localSearchQuery"
            @input="handleSearchInput"
            @focus="emit('update:showSearchResults', true)"
            @blur="handleSearchBlur"
            type="text"
            :placeholder="t ? t('nav.search') : 'Search...'"
            class="w-full bg-transparent outline-none text-sm font-medium text-white placeholder-white/40"
          />
          <transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 scale-50"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-50"
          >
            <button
              v-if="globalSearchQuery"
              aria-label="Clear Search"
              @click="emit('update:globalSearchQuery', '')"
              class="text-white/40 hover:text-white hover:bg-white/10 rounded-full p-1 transition-all duration-200"
            >
              <X class="w-3 h-3" />
            </button>
          </transition>
        </div>
      </div>

      <!-- Coin Counter - Gamified -->
      <div
        class="header-button group !w-auto px-3 gap-2 !bg-gradient-to-r from-amber-500/20 to-yellow-500/20 !border-amber-500/30"
        :class="{ '!bg-white/10 !border-white/20': isImmersive }"
      >
        <Coins
          class="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform"
        />
        <span class="text-xs font-black text-amber-100">{{
          coinStore.coins
        }}</span>
      </div>

      <!-- Filter Button - Premium Glass Button -->
      <button
        data-testid="btn-filter"
        aria-label="Open Filter"
        @click="
          emit('open-filter');
          emit('haptic-tap');
        "
        class="header-button group"
        :class="{ '!bg-white/10 !border-white/20': isImmersive }"
      >
        <SlidersHorizontal
          class="w-5 h-5 group-hover:rotate-90 transition-transform duration-300"
        />
      </button>
    </div>

    <!-- Row 2: Category Dropdown REMOVED (Moved to Filter Menu) -->
    <!-- Preserving space or structure if needed, or removing entirely to clean up -->

    <!-- Search Results Dropdown -->
    <transition name="dropdown-fade">
      <div
        v-if="showSearchResults && globalSearchResults.length > 0"
        class="mx-4 mt-1 rounded-2xl shadow-2xl border overflow-hidden max-h-[50vh] overflow-y-auto backdrop-blur-3xl animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto bg-black/80 border-white/10"
      >
        <div
          v-for="shop in globalSearchResults"
          :key="shop.id"
          @click="emit('select-search-result', shop)"
          class="flex items-center gap-3 p-3 cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
        >
          <div
            class="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0"
          >
            <img
              v-if="shop.Image_URL1"
              :src="shop.Image_URL1"
              :alt="shop.name || ''"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-bold text-white truncate">
              {{ shop.name }}
            </h4>
            <span class="text-[10px] text-white/50">{{ shop.category }}</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   🎨 PREMIUM HEADER STYLES
   ═══════════════════════════════════════════════════════════════ */

.header-button {
  height: 44px;
  width: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  pointer-events: auto;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform; /* ✅ Fix CSS flicker during animation */
  z-index: 50;
}

.header-button:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05); /* Reduced scale slightly for stability */
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.header-button:active {
  transform: scale(0.95);
}

.search-container {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  border-radius: 22px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-container:focus-within {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow:
    0 4px 30px rgba(59, 130, 246, 0.2),
    0 0 0 4px rgba(59, 130, 246, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* ═══════════════════════════════════════════════════════════════
   📋 DROPDOWN ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.95);
  filter: blur(4px);
}

.dropdown-fade-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.7, 0, 0.84, 0);
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.95);
  filter: blur(4px);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* ═══════════════════════════════════════════════════════════════
   📱 MOBILE OPTIMIZATIONS
   ═══════════════════════════════════════════════════════════════ */

@media (hover: none) and (pointer: coarse) {
  .header-button:hover {
    transform: none;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
