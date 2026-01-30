<script setup>
import { Heart } from "lucide-vue-next";
import { onMounted } from "vue";

const props = defineProps({
	x: { type: Number, required: true },
	y: { type: Number, required: true },
});

// Optional: clean up self? Usually parent handles list splicing.
</script>

<template>
  <div
    class="pointer-events-none absolute z-[100] flex items-center justify-center"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    <div class="animate-premium-pop">
      <Heart class="w-24 h-24 fill-pink-500 text-pink-600 drop-shadow-2xl" />
    </div>
  </div>
</template>

<style scoped>
@keyframes premium-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.2) rotate(-15deg);
  }
  30% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.2) rotate(0deg);
  }
  50% {
    transform: translate(-50%, -50%) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -150%) scale(1.5) rotate(15deg);
  }
}

.animate-premium-pop {
  animation: premium-pop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
</style>
