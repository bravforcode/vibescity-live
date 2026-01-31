<template>
  <button
    class="relative flex items-center justify-center font-bold text-white transition-all duration-normal ease-standard active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
    :aria-label="label || $slots.default?.[0]?.children || 'Button'"
    :class="[
      variantClasses,
      sizeClasses,
      roundedClass,
      block ? 'w-full' : '',
      'min-h-[44px] touch-manipulation',
    ]"
    :disabled="disabled"
  >
    <!-- Glow Effect for Primary -->
    <div
      v-if="variant === 'primary' && !disabled"
      class="absolute inset-0 bg-vibe-pink/50 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-slow"
    ></div>

    <span class="relative z-10 flex items-center gap-2">
      <slot name="icon-left" />
      <slot />
      <slot name="icon-right" />
    </span>
  </button>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: {
    type: String, // primary, secondary, ghost, glass
    default: "primary",
  },
  size: {
    type: String, // sm, md, lg, icon
    default: "md",
  },
  radius: {
    type: String,
    default: "xl",
  },
  label: {
    type: String,
    default: null,
  },
  block: Boolean,
  disabled: Boolean,
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case "primary":
      return "bg-vibe-gradient shadow-elevation-2 hover:shadow-glow border border-transparent";
    case "secondary":
      return "bg-surface-glass border border-white/10 hover:bg-white/10 shadow-elevation-1";
    case "ghost":
      return "bg-transparent hover:bg-white/5 text-text-primary";
    case "glass": // Special for Map Controls
      return "bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 shadow-elevation-2";
    default:
      return "";
  }
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case "sm":
      return "px-3 py-1.5 text-xs";
    case "md":
      return "px-5 py-2.5 text-sm";
    case "lg":
      return "px-6 py-3.5 text-base";
    case "icon": // Square icon button
      return "p-3";
    default:
      return "px-5 py-2.5 text-sm";
  }
});

const roundedClass = computed(() => `rounded-${props.radius}`);
</script>
