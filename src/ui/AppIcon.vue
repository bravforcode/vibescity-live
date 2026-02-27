<script setup>
/**
 * AppIcon.vue — Thin wrapper over Iconify <Icon> using the central registry.
 * Always use registry keys (ICONS.map, ICONS.cafe, etc.), never raw strings.
 */
import { computed } from "vue";
import { ICONS, AppIcon as IconComponent } from "./icons";

const props = defineProps({
	name: {
		type: String,
		required: true,
		validator: (v) => v in ICONS,
	},
	size: {
		type: [String, Number],
		default: undefined,
	},
});

const resolvedIcon = computed(() => ICONS[props.name]);
</script>

<template>
  <IconComponent
    :icon="resolvedIcon"
    :width="size"
    :height="size"
    v-bind="$attrs"
  />
</template>
