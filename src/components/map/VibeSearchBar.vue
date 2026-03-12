<template>
  <div class="vibe-search-bar">
    <div class="search-container">
      <!-- Live Indicator -->
      <div v-if="isLive" class="live-indicator">
        <div class="live-dot"></div>
        <span class="live-text">LIVE</span>
      </div>

      <!-- Search Input -->
      <div class="search-input-wrapper">
        <label for="vibe-search-input" class="sr-only">{{ $t("nav.search") }}</label>
        <MagnifyingGlassIcon class="search-icon" aria-hidden="true" />
        <input
          id="vibe-search-input"
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          :placeholder="placeholder"
          class="search-input"
          role="combobox"
          :aria-expanded="showSuggestions && suggestions.length > 0"
          aria-autocomplete="list"
          aria-controls="vibe-search-suggestions"
          :aria-activedescendant="selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined"
          @input="handleInput"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown.enter="handleSubmit"
          @keydown.down.prevent="selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1)"
          @keydown.up.prevent="selectedIndex = Math.max(selectedIndex - 1, -1)"
          @keydown.escape="showSuggestions = false"
        />
        <button
          v-if="searchQuery"
          @click="clearSearch"
          class="clear-btn"
          :aria-label="$t('nav.clearSearch')"
        >
          <XMarkIcon class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Filter Button -->
      <button
        @click="openFilters"
        class="filter-btn"
        :class="{ 'has-active-filters': hasActiveFilters }"
        :aria-label="$t('nav.openFilter')"
        :aria-expanded="hasActiveFilters"
      >
        <FunnelIcon class="w-4 h-4" aria-hidden="true" />
      </button>
    </div>

    <!-- Search Suggestions -->
    <Transition name="search-dropdown">
      <div
        v-if="showSuggestions && (suggestions.length > 0 || isLoading)"
        id="vibe-search-suggestions"
        class="search-suggestions"
        role="listbox"
        :aria-label="$t('nav.searchResults')"
      >
        <!-- Loading State -->
        <div v-if="isLoading" class="suggestion-item loading" role="status">
          <div class="loading-spinner"></div>
          <span>{{ $t("nav.searching") }}</span>
        </div>

        <!-- Suggestions List -->
        <template v-else>
          <div
            v-for="(suggestion, index) in suggestions"
            :id="`suggestion-${index}`"
            :key="suggestion.id"
            class="suggestion-item"
            :class="{ 'is-selected': selectedIndex === index }"
            role="option"
            :aria-selected="selectedIndex === index"
            @click="selectSuggestion(suggestion)"
            @mouseenter="selectedIndex = index"
          >
            <div class="suggestion-icon">
              <component :is="getSuggestionIcon(suggestion)" class="w-4 h-4" />
            </div>
            <div class="suggestion-content">
              <div class="suggestion-name">{{ suggestion.name }}</div>
              <div class="suggestion-meta">
                {{ suggestion.category }} • {{ formatDistance(suggestion.distance) }}
              </div>
            </div>
            <div class="suggestion-vibe">
              <div class="vibe-indicator-small">
                <div 
                  class="vibe-fill-small" 
                  :style="{ width: `${(suggestion.vibe || 0) * 20}%` }"
                ></div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import {
	BeakerIcon,
	BuildingStorefrontIcon,
	FunnelIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	MusicalNoteIcon,
	XMarkIcon,
} from "@heroicons/vue/24/outline";
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps({
	placeholder: {
		type: String,
		default: "ค้นหาบรรยากาศ อีเวนต์",
	},
	isLive: {
		type: Boolean,
		default: false,
	},
	suggestions: {
		type: Array,
		default: () => [],
	},
	isLoading: {
		type: Boolean,
		default: false,
	},
	hasActiveFilters: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits([
	"update:query",
	"submit",
	"select-suggestion",
	"open-filters",
	"clear",
]);

const searchQuery = ref("");
const searchInput = ref(null);
const showSuggestions = ref(false);
const selectedIndex = ref(-1);

// Icon mapping for suggestions
const suggestionIcons = {
	restaurant: BeakerIcon,
	cafe: BeakerIcon,
	bar: MusicalNoteIcon,
	nightlife: MusicalNoteIcon,
	temple: BuildingStorefrontIcon,
	shop: BuildingStorefrontIcon,
	default: MapPinIcon,
};

const getSuggestionIcon = (suggestion) => {
	const category = suggestion.category?.toLowerCase() || "";
	return suggestionIcons[category] || suggestionIcons.default;
};

const formatDistance = (distance) => {
	if (!distance) return "";
	if (distance < 1000) return `${Math.round(distance)} m`;
	return `${(distance / 1000).toFixed(1)} km`;
};

const handleInput = (event) => {
	const value = event.target.value;
	searchQuery.value = value;
	emit("update:query", value);
	showSuggestions.value = value.length > 0;
	selectedIndex.value = -1;
};

const handleFocus = () => {
	showSuggestions.value = searchQuery.value.length > 0;
};

const handleBlur = () => {
	// Delay hiding suggestions to allow click events
	setTimeout(() => {
		showSuggestions.value = false;
		selectedIndex.value = -1;
	}, 150);
};

const handleSubmit = () => {
	if (selectedIndex.value >= 0 && props.suggestions[selectedIndex.value]) {
		selectSuggestion(props.suggestions[selectedIndex.value]);
	} else {
		emit("submit", searchQuery.value);
	}
	showSuggestions.value = false;
};

const selectSuggestion = (suggestion) => {
	emit("select-suggestion", suggestion);
	searchQuery.value = suggestion.name;
	showSuggestions.value = false;
	selectedIndex.value = -1;
};

const clearSearch = () => {
	searchQuery.value = "";
	emit("clear");
	showSuggestions.value = false;
	selectedIndex.value = -1;
	searchInput.value?.focus();
};

const openFilters = () => {
	emit("open-filters");
};

// Keyboard navigation
watch(selectedIndex, (newIndex) => {
	if (newIndex >= 0 && props.suggestions[newIndex]) {
		// Scroll selected item into view
		nextTick(() => {
			const items = document.querySelectorAll(".suggestion-item");
			const selectedItem = items[newIndex];
			selectedItem?.scrollIntoView({ block: "nearest" });
		});
	}
});
</script>

<style scoped>
.vibe-search-bar {
  @apply relative w-full max-w-2xl mx-auto;
}

.search-container {
  @apply flex items-center gap-2 p-3 rounded-2xl backdrop-blur-xl border border-white/10;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.live-indicator {
  @apply flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30;
}

.live-dot {
  @apply w-2 h-2 rounded-full bg-red-500;
  animation: pulse 2s infinite;
}

.live-text {
  @apply text-xs font-bold text-red-400 tracking-wider;
}

.search-input-wrapper {
  @apply relative flex-1 flex items-center;
}

.search-icon {
  @apply absolute left-3 w-4 h-4 text-gray-400 pointer-events-none;
}

.search-input {
  @apply w-full pl-10 pr-10 py-2 bg-transparent text-white placeholder-gray-500 border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50;
  font-size: 16px; /* Prevents zoom on iOS */
}

.clear-btn {
  @apply absolute right-3 p-1 text-gray-400 hover:text-white transition-colors;
}

.filter-btn {
  @apply p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition duration-200;
}

.filter-btn.has-active-filters {
  @apply text-blue-400 bg-blue-500/20 hover:bg-blue-500/30;
}

.search-suggestions {
  @apply absolute top-full left-0 right-0 mt-2 rounded-2xl backdrop-blur-xl border border-white/10 overflow-hidden z-50;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
  max-height: 320px;
  overflow-y: auto;
}

.suggestion-item {
  @apply flex items-center gap-3 px-4 py-3 hover:bg-gray-100 cursor-pointer transition-colors;
}

.suggestion-item.is-selected {
  @apply bg-blue-50;
}

.suggestion-item.loading {
  @apply justify-center text-gray-500;
}

.suggestion-icon {
  @apply p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-500;
}

.suggestion-content {
  @apply flex-1;
}

.suggestion-name {
  @apply font-medium text-gray-900;
}

.suggestion-meta {
  @apply text-sm text-gray-500;
}

.suggestion-vibe {
  @apply flex items-center;
}

.vibe-indicator-small {
  @apply w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden;
}

.vibe-fill-small {
  @apply h-full bg-gradient-to-r from-pink-500 to-purple-500;
}

.loading-spinner {
  @apply w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin;
}

/* Animations */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Transitions */
.search-dropdown-enter-active,
.search-dropdown-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-dropdown-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.search-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .search-suggestions {
    background: linear-gradient(135deg, rgba(30, 30, 60, 0.95), rgba(30, 30, 60, 0.9));
  }
  
  .suggestion-item {
    @apply hover:bg-gray-800;
  }
  
  .suggestion-item.is-selected {
    @apply bg-blue-900/50;
  }
  
  .suggestion-name {
    @apply text-white;
  }
  
  .suggestion-meta {
    @apply text-gray-400;
  }
  
  .vibe-indicator-small {
    @apply bg-gray-700;
  }
}

/* Responsive */
@media (max-width: 640px) {
  .search-container {
    @apply px-2 py-2;
  }
  
  .search-input {
    @apply text-sm;
  }
  
  .suggestion-item {
    @apply px-3 py-2;
  }
}
</style>
