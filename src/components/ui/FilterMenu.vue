<script setup>
import {
  Check,
  Coffee,
  Music,
  ShoppingBag,
  Star,
  ThumbsUp,
  Utensils,
  X,
} from "lucide-vue-next";
import { ref } from "vue";

const props = defineProps({
  isOpen: Boolean,
  selectedCategories: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "apply"]);

const categories = [
  {
    id: "Recommended",
    label: "Recommended",
    icon: ThumbsUp,
    color: "text-green-400",
  },
  {
    id: "Cafe",
    label: "Cafe & Bistro",
    icon: Coffee,
    color: "text-orange-400",
  },
  {
    id: "Nightlife",
    label: "Nightlife",
    icon: Music,
    color: "text-purple-500",
  },
  {
    id: "Restaurant",
    label: "Restaurant",
    icon: Utensils,
    color: "text-red-400",
  },
  {
    id: "Shopping",
    label: "Fashion & Shopping",
    icon: ShoppingBag,
    color: "text-pink-400",
  },
  {
    id: "Events",
    label: "Events & Festivals",
    icon: Star,
    color: "text-yellow-400",
  },
];

const selected = ref([...props.selectedCategories]);

// ✅ Watch for prop changes and sync selected
import { watch } from "vue";

watch(
  () => props.selectedCategories,
  (newVal) => {
    selected.value = [...newVal];
  },
);

const toggleCategory = (id) => {
  const idx = selected.value.indexOf(id);
  if (idx === -1) selected.value.push(id);
  else selected.value.splice(idx, 1);
};

const applyFilters = () => {
  emit("apply", selected.value);
  emit("close");
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[8000] flex items-start justify-end p-4 pt-16"
  >
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
      @click="$emit('close')"
      @touchmove.prevent
    ></div>

    <div
      data-testid="filter-menu"
      class="relative w-64 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in-right"
    >
      <!-- Header -->
      <div
        class="p-4 border-b border-white/10 flex items-center justify-between bg-white/5"
      >
        <h3 class="text-sm font-black text-white uppercase tracking-widest">
          Filter Vibe
        </h3>
        <button
          @click="$emit('close')"
          class="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <X class="w-3 h-3" />
        </button>
      </div>

      <!-- List -->
      <div class="p-2 space-y-1">
        <button
          v-for="cat in categories"
          :key="cat.id"
          @click="toggleCategory(cat.id)"
          class="w-full flex items-center justify-between p-3 rounded-xl transition-all"
          :class="
            selected.includes(cat.id)
              ? 'bg-blue-600/20 border border-blue-500/50'
              : 'hover:bg-white/5 border border-transparent'
          "
        >
          <div class="flex items-center gap-3">
            <component :is="cat.icon" class="w-4 h-4" :class="cat.color" />
            <span class="text-sm font-bold text-white">{{ cat.label }}</span>
          </div>
          <div
            v-if="selected.includes(cat.id)"
            class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"
          >
            <Check class="w-3 h-3 text-white" stroke-width="4" />
          </div>
        </button>
      </div>

      <!-- Footer -->
      <div class="p-3 border-t border-white/10 bg-black/40">
        <button
          @click="applyFilters"
          class="w-full py-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-gray-200 active:scale-95 transition-all shadow-lg"
        >
          Apply Filters
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in-right {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
.animate-fade-in-right {
  animation: fade-in-right 0.2s ease-out forwards;
}
</style>
