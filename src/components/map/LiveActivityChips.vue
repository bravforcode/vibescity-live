<script setup>
const props = defineProps({
	chips: {
		type: Array,
		default: () => [],
	},
});

const toneClass = (tone) => {
	if (tone === "hot")
		return "from-rose-500/35 to-orange-400/35 border-rose-300/30";
	if (tone === "surge")
		return "from-cyan-500/35 to-blue-500/35 border-cyan-300/30";
	return "from-violet-500/35 to-fuchsia-500/35 border-violet-300/30";
};
</script>

<template>
  <div class="flex flex-col gap-2 max-w-[210px]">
    <div
      v-for="chip in chips"
      :key="chip.id"
      class="chip-card px-3 py-2 rounded-xl border bg-gradient-to-r text-white shadow-lg"
      :class="toneClass(chip.tone)"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="text-[11px] font-black uppercase tracking-wider text-white/90">
          {{ chip.label }}
        </div>
        <div class="text-xs font-black text-white">
          {{ Number(chip.value || 0).toLocaleString() }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chip-card {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: chipFadeIn 220ms ease;
}

@keyframes chipFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
