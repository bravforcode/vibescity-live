<script setup>
import coinAnimation from "@/assets/animations/coin.json";

defineProps({
	size: { type: Number, default: 40 },
	loop: { type: Boolean, default: true },
});
</script>

<template>
  <Vue3Lottie
    :animationData="coinAnimation"
    :height="size"
    :width="size"
    :loop="loop"
    :autoPlay="true"
  />
</template>
