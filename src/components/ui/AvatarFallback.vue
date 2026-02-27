<script setup>
/**
 * AvatarFallback.vue — Graceful image fallback with initials + hash color
 * Item 6: Enterprise UX Hardening
 */
import { computed } from "vue";

const props = defineProps({
	name: { type: String, default: "" },
	id: { type: [String, Number], default: 0 },
	size: { type: String, default: "w-full h-full" },
});

const initials = computed(() => {
	const n = (props.name || "??").trim();
	const parts = n.split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return n.slice(0, 2).toUpperCase();
});

const PALETTE = [
	"#8B5CF6",
	"#EC4899",
	"#10B981",
	"#F59E0B",
	"#3B82F6",
	"#EF4444",
	"#14B8A6",
	"#A855F7",
];

const bgColor = computed(() => {
	const s = String(props.id || props.name || "0");
	let h = 0;
	for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	return PALETTE[Math.abs(h) % PALETTE.length];
});
</script>

<template>
  <div
    :class="['flex items-center justify-center rounded-xl text-white font-bold select-none', size]"
    :style="{ backgroundColor: bgColor }"
    role="img"
    :aria-label="name || 'Avatar'"
  >
    <span class="text-sm opacity-90">{{ initials }}</span>
  </div>
</template>
