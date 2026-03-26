<template>
  <div
    v-if="place"
    class="vibe-place-card glass-card"
    :class="{ 'is-selected': isSelected }"
  >
    <!-- Header with Category Icon -->
    <div class="card-header">
      <div class="category-icon">
        <component :is="categoryIcon" class="w-5 h-5" />
      </div>
      <div class="category-label">{{ place.category?.toUpperCase() || 'VENUE' }}</div>
      <div class="distance">{{ formatDistance(place.distance) }}</div>
    </div>

    <!-- Main Content -->
    <div class="card-content">
      <h3 class="place-name">{{ place.name }}</h3>
      <p class="place-description">{{ place.description || 'A popular spot in the area' }}</p>
      
      <!-- Vibe Indicator -->
      <div class="vibe-indicator">
        <div class="vibe-bar">
          <div 
            class="vibe-fill" 
            :style="{ width: `${vibePercentage}%` }"
          ></div>
        </div>
        <span class="vibe-label">{{ $t("auto.k_57e39f9") }} {{ vibeLevel }}</span>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="card-actions">
      <button 
        @click="handleNavigate"
        class="action-btn primary-btn"
      >
        <PaperAirplaneIcon class="w-4 h-4" />
        Navigate
      </button>
      
      <button 
        @click="handleRide"
        class="action-btn secondary-btn"
      >
        <TruckIcon class="w-4 h-4" />
        Ride
      </button>
    </div>

    <!-- Special Actions (when applicable) -->
    <div v-if="showSpecialActions" class="special-actions">
      <button 
        @click="handleClaimVibe"
        class="special-btn claim-btn"
      >
        <SparklesIcon class="w-4 h-4" /> {{ $t("auto.k_2be7575a") }} </button>
      
      <button 
        @click="handleTakeMeThere"
        class="special-btn take-me-btn"
      >
        <MapPinIcon class="w-4 h-4" /> {{ $t("auto.k_ff8907c2") }} </button>
    </div>
  </div>
</template>

<script setup>
import {
	BeakerIcon,
	BuildingStorefrontIcon,
	MapPinIcon,
	MusicalNoteIcon,
	PaperAirplaneIcon,
	SparklesIcon,
	TruckIcon,
} from "@heroicons/vue/24/outline";
import { computed } from "vue";

const props = defineProps({
	place: {
		type: Object,
		required: true,
	},
	isSelected: {
		type: Boolean,
		default: false,
	},
	showSpecialActions: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["navigate", "ride", "claim-vibe", "take-me-there"]);

// Category icon mapping
const categoryIcons = {
	restaurant: BeakerIcon,
	cafe: BeakerIcon,
	bar: MusicalNoteIcon,
	nightlife: MusicalNoteIcon,
	temple: BuildingStorefrontIcon,
	shop: BuildingStorefrontIcon,
	default: MapPinIcon,
};

const categoryIcon = computed(() => {
	const category = props.place.category?.toLowerCase() || "";
	return categoryIcons[category] || categoryIcons.default;
});

// Vibe level calculation
const vibePercentage = computed(() => {
	const vibe = props.place.vibe || props.place.vibe_level || 0;
	return Math.min(Math.max(vibe * 20, 0), 100); // Convert to percentage
});

const vibeLevel = computed(() => {
	const percentage = vibePercentage.value;
	if (percentage >= 80) return "High";
	if (percentage >= 50) return "Moderate";
	if (percentage >= 20) return "Low";
	return "Quiet";
});

// Distance formatting
const formatDistance = (distance) => {
	if (!distance) return "";
	if (distance < 1000) return `${Math.round(distance)} m`;
	return `${(distance / 1000).toFixed(1)} km`;
};

// Event handlers
const handleNavigate = () => {
	emit("navigate", props.place);
};

const handleRide = () => {
	emit("ride", props.place);
};

const handleClaimVibe = () => {
	emit("claim-vibe", props.place);
};

const handleTakeMeThere = () => {
	emit("take-me-there", props.place);
};
</script>

<style scoped>
.vibe-place-card {
  @apply relative w-full max-w-sm rounded-2xl p-4 backdrop-blur-xl border border-white/10;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.vibe-place-card:hover {
  @apply scale-105;
  box-shadow: 
    0 12px 48px rgba(59, 130, 246, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-color: rgba(59, 130, 246, 0.3);
}

.vibe-place-card.is-selected {
  @apply ring-2 ring-blue-500/50;
  border-color: rgba(59, 130, 246, 0.5);
}

.card-header {
  @apply flex items-center justify-between mb-3;
}

.category-icon {
  @apply p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-400;
}

.category-label {
  @apply text-xs font-bold text-pink-400 tracking-wider;
}

.distance {
  @apply text-xs text-gray-400 font-medium;
}

.card-content {
  @apply mb-4;
}

.place-name {
  @apply text-lg font-bold text-white mb-2;
}

.place-description {
  @apply text-sm text-gray-300 mb-3 line-clamp-2;
}

.vibe-indicator {
  @apply flex items-center gap-2;
}

.vibe-bar {
  @apply flex-1 h-2 bg-gray-700 rounded-full overflow-hidden;
}

.vibe-fill {
  @apply h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500;
}

.vibe-label {
  @apply text-xs font-bold text-purple-400 whitespace-nowrap;
}

.card-actions {
  @apply flex gap-2 mb-3;
}

.action-btn {
  @apply flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200;
}

.primary-btn {
  @apply bg-blue-500 hover:bg-blue-600 text-white;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.secondary-btn {
  @apply bg-gray-700 hover:bg-gray-600 text-white;
  background: linear-gradient(135deg, #374151, #1f2937);
}

.special-actions {
  @apply space-y-2;
}

.special-btn {
  @apply w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold text-white transition-all duration-300;
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

/* Glass card base styles */
.glass-card {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* Responsive */
@media (max-width: 640px) {
  .vibe-place-card {
    @apply max-w-full;
  }
  
  .card-actions {
    @apply flex-col;
  }
  
  .action-btn {
    @apply w-full;
  }
}
</style>
