<script setup>
/**
 * PhotoGallery.vue - Lightbox photo gallery
 * Feature #22: Photo Gallery Light Box
 */
import { ref, computed, watch } from "vue";

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

watch(
  () => props.initialIndex,
  (val) => {
    currentIndex.value = val;
  },
);

const currentImage = computed(() => props.images[currentIndex.value] || null);

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

import { onMounted, onUnmounted } from "vue";
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
        @click.self="close"
        @touchstart.passive="handleTouchStart"
        @touchend="handleTouchEnd"
      >
        <!-- Close button -->
        <button
          @click="close"
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
          @click="prev"
          class="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center backdrop-blur-md hover:bg-black/70 transition-colors"
        >
          ‹
        </button>

        <button
          v-if="images.length > 1"
          @click="next"
          class="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center backdrop-blur-md hover:bg-black/70 transition-colors"
        >
          ›
        </button>

        <!-- Main image -->
        <div class="gallery-image-container">
          <Transition name="slide" mode="out-in">
            <img
              :key="currentIndex"
              :src="currentImage"
              class="gallery-image"
              alt="Gallery image"
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
            @click="currentIndex = i"
            :class="[
              'w-12 h-12 rounded-lg overflow-hidden border-2 transition-all',
              i === currentIndex
                ? 'border-white scale-110'
                : 'border-transparent opacity-60 hover:opacity-100',
            ]"
          >
            <img :src="img" class="w-full h-full object-cover" />
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
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
}

.gallery-image-container {
  max-width: 90vw;
  max-height: 80vh;
}

.gallery-image {
  max-width: 100%;
  max-height: 80vh;
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
  transition: all 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
