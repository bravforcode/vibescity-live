<script setup>
import { useIntersectionObserver } from "@vueuse/core";
import { Store } from "lucide-vue-next";
import { onUnmounted, ref, watch } from "vue";

const props = defineProps({
	src: {
		type: String,
		required: true,
	},
	alt: {
		type: String,
		default: "",
	},
	imgClass: {
		type: [String, Array, Object],
		default: "",
	},
	containerClass: {
		type: [String, Array, Object],
		default: "w-full h-full",
	},
	fallbackIconClass: {
		type: String,
		default: "w-6 h-6 text-white/20",
	},
});

const emit = defineEmits(["load", "error"]);

const containerRef = ref(null);
const isLoaded = ref(false);
const hasError = ref(false);
const isVisible = ref(false);
const currentSrc = ref("");

const load = () => {
	if (!props.src || hasError.value || isLoaded.value) return;

	const img = new Image();
	img.onload = () => {
		currentSrc.value = props.src;
		isLoaded.value = true;
		emit("load");
	};
	img.onerror = () => {
		hasError.value = true;
		emit("error");
	};
	img.src = props.src;
};

const { stop } = useIntersectionObserver(
	containerRef,
	([{ isIntersecting }]) => {
		if (isIntersecting) {
			isVisible.value = true;
			load();
			stop(); // Only observe until it becomes visible
		}
	},
	{
		rootMargin: "200px 0px 200px 0px", // Preload a bit earlier
	},
);

watch(
	() => props.src,
	() => {
		isLoaded.value = false;
		hasError.value = false;
		currentSrc.value = "";
		if (isVisible.value) {
			load();
		}
	},
);

onUnmounted(() => {
	stop();
});
</script>

<template>
  <div
    ref="containerRef"
    :class="['image-loader relative overflow-hidden', containerClass]"
  >
    <!-- Skeleton Shimmer (shows before loaded and without error) -->
    <transition name="fade-fast">
      <div
        v-if="!isLoaded && !hasError"
        class="absolute inset-0 z-0 bg-zinc-800/80 skeleton-shimmer"
      ></div>
    </transition>

    <!-- Error Fallback -->
    <transition name="fade-fast">
      <div
        v-if="hasError || (!src && !isLoaded)"
        class="absolute inset-0 z-0 flex items-center justify-center bg-zinc-900/50 fallback-bg"
      >
        <Store :class="fallbackIconClass" />
      </div>
    </transition>

    <!-- Completed Image -->
    <transition name="fade">
      <img
        v-show="isLoaded && !hasError"
        :src="currentSrc"
        :alt="alt"
        :class="['absolute inset-0 w-full h-full object-cover z-10', imgClass]"
        loading="lazy"
        draggable="false"
      />
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to,
.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton-shimmer {
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.02) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.02) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none;
  }
}
</style>
