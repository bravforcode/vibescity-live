<!-- src/components/layout/SmartHeader.vue -->
<script setup>
import { Menu, Search, X } from "lucide-vue-next";

defineProps({
  isVibeNowCollapsed: Boolean,
  isDarkMode: Boolean,
  globalSearchQuery: String,
  showSearchResults: Boolean,
  globalSearchResults: {
    type: Array,
    default: () => [],
  },
  t: Function,
});

const emit = defineEmits([
  "open-sidebar",
  "update:globalSearchQuery",
  "update:showSearchResults",
  "select-search-result",
  "haptic-tap",
]);
</script>

<template>
  <div
    data-testid="header"
    class="fixed top-0 left-0 right-0 z-[5000] flex flex-col pointer-events-none transition-transform duration-300"
    :class="isVibeNowCollapsed ? '-translate-y-full' : 'translate-y-0'"
  >
    <!-- Top Row: Hamburger + Search + Profile -->
    <div class="flex items-center gap-3 px-4 pt-4 pb-2">
      <!-- Hamburger -->
      <button
        data-testid="btn-menu"
        aria-label="Open Menu"
        @click="
          emit('open-sidebar');
          emit('haptic-tap');
        "
        class="h-10 w-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white shadow-lg pointer-events-auto active:scale-90 transition-all flex-shrink-0"
      >
        <Menu class="w-5 h-5" />
      </button>

      <!-- Search Bar -->
      <div class="flex-1 pointer-events-auto relative z-50">
        <div
          class="flex items-center h-10 px-3 rounded-full backdrop-blur-xl border shadow-lg transition-all duration-300 group focus-within:ring-2 focus-within:ring-blue-500/50 bg-black/30 border-white/10"
        >
          <Search
            class="w-4 h-4 text-white/50 group-focus-within:text-blue-400 mr-2"
          />
          <input
            data-testid="search-input"
            aria-label="Search venues"
            :value="globalSearchQuery"
            @input="emit('update:globalSearchQuery', $event.target.value)"
            @focus="emit('update:showSearchResults', true)"
            @blur="
              setTimeout(() => emit('update:showSearchResults', false), 200)
            "
            type="text"
            :placeholder="t ? t('nav.search') : 'Search...'"
            class="w-full bg-transparent outline-none text-xs font-bold text-white placeholder-white/40"
          />
          <button
            v-if="globalSearchQuery"
            aria-label="Clear Search"
            @click="emit('update:globalSearchQuery', '')"
            class="text-white/40 hover:text-white"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
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
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

.dropdown-fade-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-fade-leave-active {
  transition: all 0.15s ease-in;
}
.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
