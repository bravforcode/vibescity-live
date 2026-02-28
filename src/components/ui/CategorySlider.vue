<!-- src/components/ui/CategorySlider.vue -->
<script setup>
import { useHaptics } from "../../composables/useHaptics";

const props = defineProps({
	activeCategory: {
		type: String,
		default: "All",
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
});

const emit = defineEmits(["select"]);
const { tapFeedback } = useHaptics();

const categories = [
	{ id: "All", label: "All" },
	{ id: "Live", label: "🔴 Live", special: true },
	{ id: "Bar", label: "Bar" },
	{ id: "Club", label: "Club" },
	{ id: "Restaurant", label: "Restaurant" },
	{ id: "Karaoke", label: "Karaoke" },
	{ id: "Cafe", label: "Cafe" },
	{ id: "Massage", label: "Massage" },
];

const handleSelect = (categoryId) => {
	tapFeedback();
	emit("select", categoryId);
};
</script>

<template>
  <div
    class="category-slider w-full overflow-x-auto no-scrollbar py-2 px-4 flex items-center gap-2 pointer-events-auto"
  >
    <button
      v-for="cat in categories"
      :key="cat.id"
      @click="handleSelect(cat.id)"
      class="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-[transform,background-color,color,box-shadow] shadow-md active:scale-95 whitespace-nowrap"
      :class="[
        activeCategory === cat.id
          ? cat.special
            ? 'bg-red-500 text-white shadow-red-500/30'
            : 'bg-white text-black shadow-white/20'
          : 'bg-black/50 text-white/80 border border-white/10 hover:bg-black/70 backdrop-blur-md',
      ]"
    >
      {{ cat.label }}
    </button>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>
