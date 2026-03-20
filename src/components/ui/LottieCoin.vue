<script setup>
import { defineAsyncComponent } from "vue";
import coinAnimation from "@/assets/animations/coin.json";

const Vue3Lottie = defineAsyncComponent(() =>
	import("vue3-lottie").then((mod) => mod.Vue3Lottie),
);

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
