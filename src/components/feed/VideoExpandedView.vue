<script setup>
import { Heart, MapPin, Send, Share2 } from "lucide-vue-next";

const props = defineProps({
	shop: {
		type: Object,
		required: true,
	},
	carouselShops: {
		type: Array,
		default: () => [],
	},
	videoRef: Object,
	isFavorited: Function,
});

const emit = defineEmits([
	"close",
	"toggle-favorite",
	"open-ride",
	"share-shop",
	"select-shop",
]);
</script>

<template>
  <div
    class="fixed inset-0 z-[3500] pointer-events-auto overflow-hidden bg-black"
  >
    <!-- Video/Image Container -->
    <div class="absolute inset-0 video-ken-burns">
      <video
        v-if="shop.Video_URL"
        :ref="videoRef"
        :src="shop.Video_URL"
        :poster="shop.Image_URL1"
        muted
        loop
        playsinline
        autoplay
        class="w-full h-full object-cover opacity-80"
      >
        <track kind="captions" />
      </video>
      <img
        v-else-if="shop.Image_URL1"
        :src="shop.Image_URL1"
        :alt="shop.name"
        class="w-full h-full object-cover opacity-80"
      />
      <div
        v-else
        class="w-full h-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600"
      ></div>
    </div>

    <!-- Gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30"
    ></div>

    <!-- Close button -->
    <button
      @click="emit('close')"
      class="premium-button absolute top-28 right-4 px-4 py-2 rounded-full glass-button flex items-center gap-2 text-white z-[100] hover:scale-105 active:scale-95 transition-transform duration-300 ease-out shadow-xl font-bold text-xs uppercase tracking-widest border border-white/20 bg-black/40 backdrop-blur-md"
      aria-label="Go back"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>{{ $t("nav.back") }}</span>
    </button>

    <!-- Shop Info -->
    <div class="absolute bottom-[240px] left-5 right-20 z-10 animate-slide-up">
      <h2
        class="text-3xl font-black text-white mb-2 drop-shadow-2xl tracking-tight"
      >
        {{ shop.name }}
      </h2>
      <p
        class="text-sm text-white/80 mb-4 line-clamp-2 font-medium max-w-md"
      >
        {{ shop.description || shop.category }}
      </p>
      <div class="flex items-center gap-3 flex-wrap">
        <span
          class="px-3 py-1.5 rounded-full glass-pill text-xs font-bold text-white inline-flex items-center gap-1.5"
        >
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          {{ shop.category || "Venue" }}
        </span>
        <span
          v-if="shop.distance"
          class="text-sm text-white/70 flex items-center gap-1.5 font-medium"
        >
          <MapPin class="w-4 h-4" />
          {{ shop.distance.toFixed(1) }}km away
        </span>
      </div>
    </div>

    <!-- Action buttons -->
    <div
      class="absolute right-4 bottom-[240px] flex flex-col gap-4 z-10 animate-slide-left"
    >
      <button
        @click.stop="emit('toggle-favorite', shop.id)"
        class="action-button group"
        :class="
          isFavorited(shop.id)
            ? 'text-pink-500 bg-pink-500/20'
            : 'text-white'
        "
      >
        <Heart
          class="w-6 h-6"
          :fill="isFavorited(shop.id) ? 'currentColor' : 'none'"
        />
        <span class="action-label">Like</span>
      </button>
      <button
        @click.stop="emit('open-ride', shop)"
        class="action-button text-white group"
      >
        <Send class="w-6 h-6" />
        <span class="action-label">Go</span>
      </button>
      <button
        @click.stop="emit('share-shop', shop)"
        class="action-button text-white group"
      >
        <Share2 class="w-6 h-6" />
        <span class="action-label">Share</span>
      </button>
    </div>

    <!-- Bottom carousel -->
    <div
      class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-4"
    >
      <h3
        class="px-4 mb-2 text-xs font-bold text-white/60 uppercase tracking-widest"
      >
        More Places Nearby
      </h3>
      <div
        class="flex gap-3 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory"
        style="-webkit-overflow-scrolling: touch"
      >
        <button
          v-for="s in carouselShops.slice(0, 8)"
          :key="'mini-' + s.id"
          @click="emit('select-shop', s)"
          :aria-label="`Open ${s.name}`"
          type="button"
          class="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-transform snap-center cursor-pointer"
          :class="
            shop?.id === s.id
              ? 'border-blue-500 scale-105'
              : 'border-white/20 opacity-80 hover:opacity-100'
          "
        >
          <img
            v-if="s.Image_URL1"
            :src="s.Image_URL1"
            :alt="s.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center"
          >
            <span class="text-2xl">🏪</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-ken-burns {
  animation: kenBurns 20s ease-in-out infinite alternate;
}

@keyframes kenBurns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.1) translate(-2%, -1%);
  }
}

.glass-button {
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.glass-pill {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.action-button {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease,
    box-shadow 0.3s ease;
}

.action-button:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.15);
}

.action-label {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.8;
}

.animate-slide-up {
  animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}

.animate-slide-left {
  animation: slideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideLeft {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
