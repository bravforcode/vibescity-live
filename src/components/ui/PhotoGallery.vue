<script setup>
/**
 * PhotoGallery.vue - Lightbox photo gallery
 * Feature #22: Photo Gallery Light Box
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps({
	images: {
		type: Array,
		default: () => [],
	},
	initialIndex: {
		type: Number,
		default: 0,
	},
	isOpen: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["close", "update:isOpen"]);

const currentIndex = ref(props.initialIndex);
const failedImageIndexes = ref(new Set());
const FALLBACK_IMAGE =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%230b1020'/><stop offset='1' stop-color='%2311182c'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/></svg>";

watch(
	() => props.initialIndex,
	(val) => {
		currentIndex.value = val;
	},
);

watch(
	() => props.isOpen,
	(isOpen) => {
		if (!isOpen) return;
		currentIndex.value = props.initialIndex;
		failedImageIndexes.value = new Set();
	},
);

const currentImage = computed(() => {
	if (!props.images.length) return null;
	if (failedImageIndexes.value.has(currentIndex.value)) return FALLBACK_IMAGE;
	return props.images[currentIndex.value] || FALLBACK_IMAGE;
});

const isVideo = (url) => {
	if (!url || typeof url !== "string") return false;
	return (
		/\.(mp4|webm|ogg|mov|m3u8)/i.test(url) ||
		url.includes("video") ||
		url.includes("stream")
	);
};

const markImageFailed = (index) => {
	if (!Number.isInteger(index)) return;
	const next = new Set(failedImageIndexes.value);
	next.add(index);
	failedImageIndexes.value = next;
};

const next = () => {
	if (currentIndex.value < props.images.length - 1) {
		currentIndex.value++;
	} else {
		currentIndex.value = 0; // Loop
	}
};

const prev = () => {
	if (currentIndex.value > 0) {
		currentIndex.value--;
	} else {
		currentIndex.value = props.images.length - 1; // Loop
	}
};

const close = () => {
	emit("close");
	emit("update:isOpen", false);
};

// Keyboard navigation
const handleKeydown = (e) => {
	if (!props.isOpen) return;
	if (e.key === "ArrowRight") next();
	if (e.key === "ArrowLeft") prev();
	if (e.key === "Escape") close();
};

// Touch swipe support
const touchStart = ref(0);
const handleTouchStart = (e) => {
	touchStart.value = e.touches[0].clientX;
};
const handleTouchEnd = (e) => {
	const diff = e.changedTouches[0].clientX - touchStart.value;
	if (Math.abs(diff) > 50) {
		if (diff > 0) prev();
		else next();
	}
};

onMounted(() => {
	window.addEventListener("keydown", handleKeydown);
});
onUnmounted(() => {
	window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="gallery-fade">
      <div
        v-if="isOpen && images.length > 0"
        class="gallery-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Photo gallery lightbox"
        @click.self="close"
        @touchstart.passive="handleTouchStart"
        @touchend="handleTouchEnd"
      >
        <!-- Close button -->
        <button
          type="button"
          @click="close"
          aria-label="Close gallery"
          class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/70 transition-colors"
        >
          ✕
        </button>

        <!-- Counter -->
        <div
          class="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-black/50 text-white text-sm font-bold backdrop-blur-md"
        >
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>

        <!-- Navigation arrows -->
        <button
          v-if="images.length > 1"
          type="button"
          @click="prev"
          aria-label="Previous image"
          class="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center backdrop-blur-md hover:bg-black/70 transition-colors"
        >
          ‹
        </button>

        <button
          v-if="images.length > 1"
          type="button"
          @click="next"
          aria-label="Next image"
          class="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center backdrop-blur-md hover:bg-black/70 transition-colors"
        >
          ›
        </button>

        <!-- Main image -->
        <div class="gallery-image-container flex items-center justify-center">
          <Transition name="slide" mode="out-in">
            <video
              v-if="isVideo(currentImage)"
              :key="`vid-${currentIndex}`"
              :src="currentImage"
              class="gallery-image max-h-[80vh]"
              controls
              autoplay
              playsinline
              @error="markImageFailed(currentIndex)"
            />
            <img
              v-else
              :key="`img-${currentIndex}`"
              :src="currentImage"
              class="gallery-image max-h-[80vh]"
              :alt="`Gallery image ${currentIndex + 1}`"
              @error="markImageFailed(currentIndex)"
            />
          </Transition>
        </div>

        <!-- Thumbnails -->
        <div
          v-if="images.length > 1"
          class="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4"
        >
          <button
            v-for="(img, i) in images.slice(0, 8)"
            :key="i"
            type="button"
            @click="currentIndex = i"
            :aria-label="`View image ${i + 1}`"
            :class="[
              'w-12 h-12 rounded-lg overflow-hidden border-2 transition',
              i === currentIndex
                ? 'border-white scale-110'
                : 'border-transparent opacity-60 hover:opacity-100',
            ]"
          >
            <video
              v-if="isVideo(failedImageIndexes.has(i) ? FALLBACK_IMAGE : img)"
              :src="img"
              class="w-full h-full object-cover"
              muted
              playsinline
              preload="metadata"
              @error="markImageFailed(i)"
            />
            <img
              v-else
              :src="failedImageIndexes.has(i) ? FALLBACK_IMAGE : img"
              alt="Thumbnail image"
              class="w-full h-full object-cover"
              @error="markImageFailed(i)"
            />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gallery-overlay {
  position: fixed;
  inset: 0;
  z-index: 14000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
}

.gallery-image-container {
  width: min(92vw, 1100px);
  max-width: 92vw;
  max-height: 80vh;
  aspect-ratio: 16 / 10;
}

.gallery-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.gallery-fade-enter-active,
.gallery-fade-leave-active {
  transition: opacity 0.3s ease;
}

.gallery-fade-enter-from,
.gallery-fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (prefers-reduced-motion: reduce) {
  .gallery-fade-enter-active,
  .gallery-fade-leave-active,
  .slide-enter-active,
  .slide-leave-active {
    transition: none;
  }
}
</style>
