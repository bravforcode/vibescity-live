<template>
  <div
    v-if="place"
    class="vibe-place-card glass-card"
    :class="{ 'is-selected': isSelected }"
    :style="neonStyle"
  >
    <!-- Neon callout tail — points down toward the venue's neon sign on the map -->
    <span class="neon-callout-tail" aria-hidden="true" />
    <!-- Header -->
    <div class="card-header">
      <div class="category-icon">
        <component :is="categoryIcon" class="w-4 h-4" />
      </div>
      <div class="category-label">{{ place.category?.toUpperCase() || 'VENUE' }}</div>
      <div class="distance">{{ formatDistance(place.distance) }}</div>
    </div>

    <!-- Main Content -->
    <div class="card-content">
      <h3 class="place-name">{{ place.name }}</h3>

      <!-- Vibe Indicator -->
      <div class="vibe-indicator">
        <span class="vibe-tag">{{ $t("auto.k_57e39f9") }}</span>
        <div class="vibe-bars">
          <span
            v-for="i in 5"
            :key="i"
            class="vibe-dot"
            :class="i <= Math.round(vibePercentage / 20) ? 'active' : 'inactive'"
          />
        </div>
        <span class="vibe-label">{{ vibeLevel }}</span>
      </div>
    </div>

    <!-- Action Buttons — always side-by-side -->
    <div class="card-actions">
      <button
        @click="handleNavigate"
        class="action-btn primary-btn"
        :aria-label="`Navigate to ${place.name}`"
      >
        <PaperAirplaneIcon class="w-4 h-4" />
        {{ $t("vibe.navigate") }}
      </button>
      <button
        @click="handleRide"
        class="action-btn secondary-btn"
        :aria-label="`Book a ride to ${place.name}`"
      >
        <TruckIcon class="w-4 h-4" />
        {{ $t("vibe.ride") }}
      </button>
    </div>

    <!-- Special Actions -->
    <div v-if="showSpecialActions" class="special-actions">
      <button
        @click="handleClaimVibe"
        class="special-btn claim-btn"
        :aria-label="`Claim vibe at ${place.name}`"
      >
        <SparklesIcon class="w-4 h-4" /> {{ $t("auto.k_2be7575a") }}
      </button>
      <button
        @click="handleTakeMeThere"
        class="special-btn take-me-btn"
        :aria-label="`Take me to ${place.name}`"
      >
        <MapPinIcon class="w-4 h-4" /> {{ $t("auto.k_ff8907c2") }}
      </button>
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
import { useNeonSignTheme } from "@/composables/map/useNeonSignTheme";

const { getNeonDescriptor } = useNeonSignTheme();

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

const vibePercentage = computed(() => {
	const vibe = props.place.vibe || props.place.vibe_level || 0;
	return Math.min(Math.max(vibe * 20, 0), 100);
});

const vibeLevel = computed(() => {
	const p = vibePercentage.value;
	if (p >= 80) return "High";
	if (p >= 50) return "Moderate";
	if (p >= 20) return "Low";
	return "Quiet";
});

const formatDistance = (distance) => {
	if (!distance) return "";
	if (distance < 1000)
		return `${Math.round(distance)} m (${Math.round(distance / 80)} min)`;
	return `${(distance / 1000).toFixed(1)} km`;
};

// Derive neon color per venue using the same hash as map signs
const neonColor = computed(() => {
	try {
		const descriptor = getNeonDescriptor(props.place);
		return descriptor?.neon_theme?.frame || "#06b6d4";
	} catch {
		return "#06b6d4";
	}
});

const neonStyle = computed(() => {
	const hex = neonColor.value;
	const r = parseInt(hex.slice(1, 3), 16) || 6;
	const g = parseInt(hex.slice(3, 5), 16) || 182;
	const b = parseInt(hex.slice(5, 7), 16) || 212;
	return {
		"--neon": hex,
		"--neon-border": `rgba(${r},${g},${b},0.5)`,
		"--neon-glow": `rgba(${r},${g},${b},0.28)`,
		"--neon-bg": `rgba(${r},${g},${b},0.12)`,
	};
});

const handleNavigate = () => emit("navigate", props.place);
const handleRide = () => emit("ride", props.place);
const handleClaimVibe = () => emit("claim-vibe", props.place);
const handleTakeMeThere = () => emit("take-me-there", props.place);
</script>

<style scoped>
.vibe-place-card {
  @apply relative w-full max-w-sm rounded-2xl p-3;
  overflow: visible; /* allow callout tail to render below card boundary */
  background: rgba(8, 8, 18, 0.97);
  border: 1px solid var(--neon-border, rgba(6,182,212,0.5));
  box-shadow:
    0 0 12px var(--neon-glow, rgba(6,182,212,0.28)),
    0 8px 32px rgba(0, 0, 0, 0.6);
  transition: box-shadow 0.25s ease, border-color 0.25s ease;
}

.vibe-place-card:hover {
  box-shadow:
    0 0 20px var(--neon-glow, rgba(6,182,212,0.28)),
    0 12px 40px rgba(0, 0, 0, 0.7);
}

.vibe-place-card.is-selected {
  border-color: var(--neon, #06b6d4);
}

/* No backdrop-filter — prevents map bleed-through white edge */
.glass-card {
  /* intentionally plain — opaque background is sufficient */
}

.card-header {
  @apply flex items-center gap-2 mb-2;
}

.category-icon {
  @apply p-1.5 rounded-md;
  background: var(--neon-bg, rgba(6,182,212,0.12));
  color: var(--neon, #06b6d4);
}

.category-label {
  @apply text-xs font-bold tracking-wider flex-1;
  color: var(--neon);
}

.distance {
  @apply text-xs text-gray-400 font-medium;
}

.card-content {
  @apply mb-3;
}

.place-name {
  @apply text-base font-bold text-white mb-1.5 leading-tight;
}

.vibe-indicator {
  @apply flex items-center gap-1.5;
}

.vibe-tag {
  @apply text-xs font-bold uppercase tracking-wider;
  color: var(--neon);
}

.vibe-bars {
  @apply flex gap-0.5;
}

.vibe-dot {
  @apply inline-block w-5 h-2 rounded-sm;
}

.vibe-dot.active {
  background: var(--neon, #06b6d4);
  box-shadow: 0 0 4px var(--neon-glow, rgba(6,182,212,0.5));
}

.vibe-dot.inactive {
  @apply bg-gray-700;
}

.vibe-label {
  @apply text-xs font-bold text-gray-300 ml-1;
}

/* Actions — always side-by-side, never stack */
.card-actions {
  @apply grid grid-cols-2 gap-2;
}

.action-btn {
  @apply flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-150;
  min-height: 40px;
}

.primary-btn {
  background: linear-gradient(135deg, var(--neon), color-mix(in srgb, var(--neon) 70%, #000));
  @apply text-black;
  box-shadow: 0 0 8px color-mix(in srgb, var(--neon) 40%, transparent);
}

.primary-btn:hover {
  filter: brightness(1.15);
}

.secondary-btn {
  @apply bg-white/10 hover:bg-white/15 text-white border border-white/10;
}

.special-actions {
  @apply grid grid-cols-2 gap-2 mt-2;
}

.special-btn {
  @apply flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors duration-150;
  min-height: 36px;
}

.claim-btn {
  background: linear-gradient(135deg, #ec4899, #d946ef);
  box-shadow: 0 0 8px rgba(236, 72, 153, 0.4);
}

.take-me-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

@media (max-width: 640px) {
  .vibe-place-card {
    @apply max-w-full;
  }
}

/* ====================================================
   Neon Callout Tail — points down toward venue's neon sign
   ==================================================== */
.neon-callout-tail {
  position: absolute;
  bottom: -13px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 13px solid rgba(8, 8, 18, 0.97);
  filter: drop-shadow(0 3px 6px var(--neon-glow, rgba(6,182,212,0.5)));
  pointer-events: none;
}
</style>
