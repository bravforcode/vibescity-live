<script setup>
/**
 * FilterPills.vue — Horizontal scrollable pill-chip filter bar.
 * Sits on top of the map like Google Maps category chips.
 * Emits 'update:selected' with the new selection array.
 */

import { computed } from "vue";
import { FILTER_CATEGORIES } from "@/constants/filterCategories";

const props = defineProps({
	selected: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:selected"]);

const selectedSet = computed(() => new Set(props.selected));

const toggle = (id) => {
	const next = new Set(props.selected);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	emit("update:selected", [...next]);
};

const clearAll = () => emit("update:selected", []);
</script>

<template>
  <div class="filter-pills-bar" role="toolbar" aria-label="Quick filters">
    <div class="pills-scroll scrollbar-hide">
      <!-- Reset / All chip -->
      <button
        :class="['pill-chip', { 'pill-active': selected.length === 0 }]"
        @click="clearAll"
        aria-label="Show all"
      >
        🌐 All
      </button>

      <!-- Category chips -->
      <button
        v-for="cat in FILTER_CATEGORIES"
        :key="cat.id"
        :class="['pill-chip', { 'pill-active': selectedSet.has(cat.id) }]"
        @click="toggle(cat.id)"
        :aria-pressed="selectedSet.has(cat.id)"
      >
        <component
          :is="cat.icon"
          class="pill-icon"
          :class="selectedSet.has(cat.id) ? 'text-purple-300' : 'text-white/50'"
          aria-hidden="true"
        />
        <span>{{ cat.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-pills-bar {
  pointer-events: auto;
  padding: 8px 0;
}

.pills-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 12px;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
}

.pills-scroll > * {
  scroll-snap-align: start;
  flex-shrink: 0;
}
</style>
