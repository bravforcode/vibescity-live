<template>
  <div class="fixed inset-0 z-[100] pointer-events-none">
    <!-- 1. Background Image Layer (Fixed at top) -->
    <!-- Only visible when a shop is selected -->
    <div
      v-if="shop"
      class="absolute inset-x-0 top-0 h-[45vh] bg-dark transition-opacity duration-500"
      :class="isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0'"
    >
      <!-- Image -->
      <img
        :src="shop.Image_URL1"
        class="w-full h-full object-cover opacity-80"
        alt="Shop detail background"
      />
      <!-- Gradient Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-dark"
      ></div>

      <!-- Top Header (Back Button & Actions) -->
      <div
        class="absolute top-0 inset-x-0 pt-12 px-6 flex justify-between items-center text-white"
      >
        <button
          @click="$emit('close')"
          class="p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 active:scale-95 transition-transform"
        >
          <ArrowLeft class="w-6 h-6" />
        </button>
        <span class="font-bold text-lg tracking-wide">Detail</span>
        <button
          @click="$emit('toggle-favorite', shop.id)"
          class="p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 active:scale-95 transition-transform"
        >
          <Bookmark
            class="w-6 h-6"
            :class="{ 'fill-current text-vibe-pink': isFavorited }"
          />
        </button>
      </div>

      <!-- Title Info (Floating above sheet) -->
      <div
        class="absolute bottom-24 left-6 right-6 text-white animate-fade-in-up"
      >
        <div
          class="text-sm font-medium text-vibe-pink mb-2 uppercase tracking-wider"
        >
          {{ shop.category || "Venue" }}
        </div>
        <h1
          class="text-3xl font-black leading-tight mb-2 shadow-black drop-shadow-lg"
        >
          {{ shop.name }}
        </h1>
        <div class="flex items-center text-sm text-gray-300">
          <span class="opacity-80">by {{ shop.Province || "VibeCity" }}</span>
        </div>
      </div>
    </div>

    <!-- 2. Bottom Sheet Component -->
    <BottomSheet
      v-model="sheetState"
      class="pointer-events-auto"
      :class="{ 'translate-y-full': !isOpen }"
    >
      <template #default>
        <div class="bg-white min-h-[80vh] px-6 pt-2 pb-20 text-dark-bg">
          <!-- Metadata Row -->
          <div
            class="flex justify-between items-center mb-8 border-b border-gray-100 pb-6"
          >
            <div>
              <div class="text-2xl font-bold font-display text-gray-900">
                12
                <span class="text-base font-normal text-gray-500"
                  >Highlights</span
                >
              </div>
              <div class="text-xs text-gray-400 mt-1">Last updated 24h ago</div>
            </div>
            <div
              class="flex items-center gap-2 text-gray-500 text-sm font-medium bg-gray-50 px-3 py-1.5 rounded-lg"
            >
              <Clock class="w-4 h-4" />
              <span>17:00 - 02:00</span>
            </div>
          </div>

          <!-- Description -->
          <p class="text-gray-500 leading-relaxed mb-8 text-sm">
            {{
              shop.description ||
              "Experience the best atmosphere in town. Top-rated drinks, live music, and unforgettable vibes awaiting you."
            }}
          </p>

          <!-- List Items (Lessons Style) -->
          <div class="space-y-4">
            <div
              v-for="(item, index) in [1, 2, 3, 4]"
              :key="index"
              class="flex items-center gap-4 p-3 rounded-2xl border border-gray-100 hover:border-vibe-pink/20 hover:bg-pink-50/30 transition-colors group cursor-pointer"
            >
              <!-- Icon Container -->
              <div
                class="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center text-white relative overflow-hidden"
                :class="index === 0 ? 'bg-vibe-purple' : 'bg-orange-100'"
              >
                <img
                  v-if="index === 0"
                  src="https://images.unsplash.com/photo-1514525253440-b393452e3383?w=150"
                  class="absolute inset-0 w-full h-full object-cover opacity-90"
                  alt="Lesson Thumbnail"
                />
                <div
                  v-if="index === 0"
                  class="absolute inset-0 bg-black/20 flex items-center justify-center"
                >
                  <PlayCircle
                    class="w-8 h-8 opacity-90 group-hover:scale-110 transition-transform"
                  />
                </div>
                <div v-else class="text-orange-400">
                  <Lock class="w-6 h-6" />
                </div>
              </div>

              <!-- Text Info -->
              <div class="flex-1">
                <div class="text-xs text-gray-400 font-medium mb-1">
                  {{ index === 0 ? "LIVE NOW" : "COMING SOON" }}
                </div>
                <div
                  class="font-bold text-gray-900 group-hover:text-vibe-pink transition-colors"
                >
                  {{
                    index === 0
                      ? "Live Band: The Jazz Trio"
                      : "Special Event " + index
                  }}
                </div>
              </div>
            </div>
          </div>

          <div class="h-20"></div>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup>
import { ArrowLeft, Bookmark, Clock, Lock, PlayCircle } from "lucide-vue-next";
import { ref, watch } from "vue";
import BottomSheet from "../design-system/compositions/BottomSheet.vue";

const props = defineProps({
  shop: {
    type: Object,
    default: null,
  },
  isOpen: {
    type: Boolean,
    default: false,
  },
  isFavorited: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "toggle-favorite"]);

const sheetState = ref("half"); // Initial state for sheet

// Reset sheet state when opened
watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      sheetState.value = "half";
    }
  },
);
</script>

<style scoped>
.font-display {
  font-family: "Outfit", sans-serif;
}
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
