<template>
  <!-- aria-label -->
  <div class="vibe-map-interface">
    <!-- Search Bar -->
    <div class="search-section">
      <VibeSearchBar
        :is-live="true"
        :suggestions="searchSuggestions"
        :is-loading="isSearching"
        :has-active-filters="hasActiveFilters"
        :query="searchQuery"
        @update:query="handleSearchUpdate"
        @submit="handleSearchSubmit"
        @select-suggestion="handleSuggestionSelect"
        @open-filters="openFilters"
        @clear="clearSearch"
      />
    </div>

    <!-- Special Zone Actions -->
    <div v-if="activeZone" class="zone-actions">
      <div class="zone-info">
        <h3 class="zone-name">{{ activeZone.name }}</h3>
        <p class="zone-description">{{ activeZone.description }}</p>
        <div class="zone-vibe">
          <div class="vibe-bar">
            <div 
              class="vibe-fill" 
              :style="{ width: `${activeZone.vibe_level * 100}%` }"
            ></div>
          </div>
          <span class="vibe-label">{{ $t("auto.k_b1e1a2d9") }} {{ Math.round(activeZone.vibe_level * 100) }}%</span>
        </div>
      </div>
      
      <div class="zone-buttons">
        <button 
          @click="handleClaimZoneVibe"
          class="zone-action-btn claim-btn"
        >
          <SparklesIcon class="w-5 h-5" /> {{ $t("auto.k_2be7575a") }} </button>
        
        <button 
          @click="handleTakeMeToZone"
          class="zone-action-btn take-me-btn"
        >
          <MapPinIcon class="w-5 h-5" /> {{ $t("auto.k_ff8907c2") }} </button>
      </div>
    </div>

    <!-- Selected Place Card -->
    <div v-if="selectedPlace" class="place-card-section">
      <VibePlaceCard
        :place="selectedPlace"
        :is-selected="true"
        :show-special-actions="true"
        @navigate="handleNavigateToPlace"
        @ride="handleRideToPlace"
        @claim-vibe="handleClaimPlaceVibe"
        @take-me-there="handleTakeMeToPlace"
      />
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <button 
        @click="centerOnUser"
        class="quick-action-btn"
      >
        <MapPinIcon class="w-4 h-4" /> {{ $t("auto.k_1ccc1cf2") }} </button>
      
      <button 
        @click="exploreNearby"
        class="quick-action-btn"
      >
        <MapPinIcon class="w-4 h-4" /> {{ $t("auto.k_d260a26f") }} </button>
    </div>
  </div>
</template>

<script setup>
import { MapPinIcon, SparklesIcon } from "@heroicons/vue/24/outline";
import { computed, ref, watch } from "vue";
import VibePlaceCard from "./VibePlaceCard.vue";
import VibeSearchBar from "./VibeSearchBar.vue";

const props = defineProps({
	selectedPlace: {
		type: Object,
		default: null,
	},
	activeZone: {
		type: Object,
		default: null,
	},
	searchSuggestions: {
		type: Array,
		default: () => [],
	},
	isSearching: {
		type: Boolean,
		default: false,
	},
	hasActiveFilters: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits([
	"search-update",
	"search-submit",
	"suggestion-select",
	"open-filters",
	"clear-search",
	"navigate-to-place",
	"ride-to-place",
	"claim-place-vibe",
	"take-me-to-place",
	"claim-zone-vibe",
	"take-me-to-zone",
	"center-on-user",
	"explore-nearby",
]);

const searchQuery = ref("");

// Event handlers
const handleSearchUpdate = (query) => {
	searchQuery.value = query;
	emit("search-update", query);
};

const handleSearchSubmit = (query) => {
	emit("search-submit", query);
};

const handleSuggestionSelect = (suggestion) => {
	emit("suggestion-select", suggestion);
};

const openFilters = () => {
	emit("open-filters");
};

const clearSearch = () => {
	searchQuery.value = "";
	emit("clear-search");
};

const handleNavigateToPlace = (place) => {
	emit("navigate-to-place", place);
};

const handleRideToPlace = (place) => {
	emit("ride-to-place", place);
};

const handleClaimPlaceVibe = (place) => {
	emit("claim-place-vibe", place);
};

const handleTakeMeToPlace = (place) => {
	emit("take-me-to-place", place);
};

const handleClaimZoneVibe = () => {
	if (props.activeZone) {
		emit("claim-zone-vibe", props.activeZone);
	}
};

const handleTakeMeToZone = () => {
	if (props.activeZone) {
		emit("take-me-to-zone", props.activeZone);
	}
};

const centerOnUser = () => {
	emit("center-on-user");
};

const exploreNearby = () => {
	emit("explore-nearby");
};
</script>

<style scoped>
.vibe-map-interface {
  @apply relative z-20 pointer-events-none;
}

.search-section {
  @apply absolute top-4 left-4 right-4 pointer-events-auto;
}

.zone-actions {
  @apply absolute top-20 left-4 right-4 pointer-events-auto p-4 rounded-2xl backdrop-blur-xl border border-white/10;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.zone-info {
  @apply mb-4;
}

.zone-name {
  @apply text-xl font-bold text-white mb-2;
}

.zone-description {
  @apply text-sm text-gray-300 mb-3;
}

.zone-vibe {
  @apply flex items-center gap-2;
}

.vibe-bar {
  @apply flex-1 h-2 bg-gray-700 rounded-full overflow-hidden;
}

.vibe-fill {
  @apply h-full bg-gradient-to-r from-pink-500 to-cyan-500 transition duration-slow;
}

.vibe-label {
  @apply text-sm font-bold text-cyan-400 whitespace-nowrap;
}

.zone-buttons {
  @apply flex gap-3;
}

.zone-action-btn {
  @apply flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold text-white transition duration-normal;
}

.claim-btn {
  background: linear-gradient(135deg, #ec4899, #d946ef);
  @apply hover:scale-105 active:scale-95;
  box-shadow: 0 4px 16px rgba(236, 72, 153, 0.4);
}

.take-me-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  @apply hover:scale-105 active:scale-95;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
}

.place-card-section {
  @apply absolute bottom-20 left-4 right-4 pointer-events-auto;
}

.quick-actions {
  @apply absolute bottom-4 left-4 right-4 pointer-events-auto flex gap-2 justify-center;
}

.quick-action-btn {
  @apply flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-xl border border-white/10 text-white text-sm font-medium transition duration-fast;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  @apply hover:scale-105 hover:bg-white/20;
}

/* Responsive */
@media (max-width: 640px) {
  .search-section {
    @apply top-2 left-2 right-2;
  }
  
  .zone-actions {
    @apply top-16 left-2 right-2 p-3;
  }
  
  .zone-buttons {
    @apply flex-col gap-2;
  }
  
  .place-card-section {
    @apply bottom-24 left-2 right-2;
  }
  
  .quick-actions {
    @apply bottom-2 left-2 right-2;
  }
  
  .quick-action-btn {
    @apply px-2 py-1.5 text-xs;
  }
}
</style>
