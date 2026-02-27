<template>
  <div
    class="relative overflow-hidden backdrop-blur-[20px] bg-surface-glass border border-white/10 shadow-elevation-1 transition-all duration-normal ease-emphasized"
    :class="[
      roundedClass,
      interactive
        ? 'cursor-pointer hover:bg-white/5 hover:border-white/20 hover:shadow-elevation-2 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0'
        : '',
    ]"
  >
    <slot />
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	radius: {
		type: String,
		default: "lg", // sm, md, lg, xl, 2xl
		validator: (value) =>
			["sm", "md", "lg", "xl", "2xl", "none"].includes(value),
	},
	interactive: {
		type: Boolean,
		default: false,
	},
});

const roundedClass = computed(() => {
	if (props.radius === "none") return "";
	return `rounded-${props.radius}`;
});
</script>
