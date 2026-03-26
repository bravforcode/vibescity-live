<template>
  <div
    :class="[
      'flex flex-col items-center text-center animate-scale-in pointer-events-auto',
      compact ? 'py-8 px-4' : 'py-16 px-6',
    ]"
    role="status"
    :aria-label="title"
  >
    <!-- Icon container -->
    <div
      :class="[
        'rounded-3xl flex items-center justify-center mb-5 border border-white/10',
        compact
          ? 'w-16 h-16 bg-gradient-to-br from-purple-500/15 to-pink-500/15'
          : 'w-24 h-24 bg-gradient-to-br from-purple-500/20 to-pink-500/20',
      ]"
    >
      <span :class="compact ? 'text-3xl' : 'text-5xl'" aria-hidden="true">{{ icon }}</span>
    </div>

    <!-- Text -->
    <h3
      :class="[
        'font-black text-white mb-2',
        compact ? 'text-sm' : 'text-lg',
      ]"
    >
      {{ title }}
    </h3>
    <p
      :class="[
        'text-white/60 leading-relaxed',
        compact ? 'text-xs max-w-[160px]' : 'text-sm max-w-xs mb-6',
      ]"
    >
      {{ message }}
    </p>

    <!-- Optional CTA -->
    <button
      v-if="ctaLabel && !compact"
      @click="emit('cta')"
      class="px-5 py-3 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors active:scale-95 border border-white/10 cursor-pointer"
    >
      {{ ctaLabel }}
    </button>

    <!-- Default slot for custom content -->
    <slot />
  </div>
</template>

<script setup>
defineProps({
	icon: { type: String, default: "🎭" },
	title: { type: String, required: true },
	message: { type: String, default: "" },
	ctaLabel: { type: String, default: "" },
	compact: { type: Boolean, default: false },
});
const emit = defineEmits(["cta"]);
</script>
