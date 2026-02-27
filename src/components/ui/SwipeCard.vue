<script setup>
/**
 * SwipeCard.vue - God Tier Edition (Loki Mode)
 * Premium gestures, physics, visual depth, and universal pointer support.
 */

import { useHaptics } from "@/composables/useHaptics";
import {
  Car,
  ChevronUp,
  Clock,
  Heart,
  ImageOff,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
  threshold: { type: Number, default: 90 },
  showExpand: { type: Boolean, default: true },
  isSelected: { type: Boolean, default: false }, // Highest Z-Index
  isImmersive: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false },
  shop: { type: Object },
});

const emit = defineEmits([
  "swipe-left",
  "swipe-right",
  "expand",
  "toggle-favorite",
  "share",
  "open-ride",
]);

const { selectFeedback, successFeedback, impactFeedback } = useHaptics();
const shopStore = useShopStore();
const favoritesStore = useFavoritesStore();

// ==========================================
// ✅ STATE & COMPUTED PROPERTIES
// ==========================================

const displayName = computed(
  () => props.shop?.name || props.shop?.Name || "Venue",
);
const displayCategory = computed(
  () =>
    props.shop?.category ||
    props.shop?.Category ||
    props.shop?.type ||
    "General",
);
const displayTime = computed(() => {
  const o = props.shop?.openTime || props.shop?.OpenTime || "10:00";
  const c = props.shop?.closeTime || props.shop?.CloseTime || "22:00";
  return `${o} - ${c}`;
});
const displayDistance = computed(() => {
  const d = props.shop?.distance || props.shop?.Distance;
  return d === undefined ? "Nearby" : `${Number(d).toFixed(1)}km`;
});

const displayRating = computed(() => {
  return props.shop?.rating ?? "-";
});

const isFavorite = computed(() => {
  return props.shop?.id ? favoritesStore.isFavorite(props.shop.id) : false;
});

// ==========================================
// ✅ FAVORITES LOGIC
// ==========================================

const showHeartAnim = ref(false);

const toggleFavorite = () => {
  if (props.shop?.id) {
    const added = favoritesStore.toggleFavorite(props.shop.id);
    successFeedback();
    if (added) {
      showHeartAnim.value = true;
      setTimeout(() => {
        showHeartAnim.value = false;
      }, 800);
    }
    emit("toggle-favorite", { shopId: props.shop.id, isFavorite: added });
  }
};

// ==========================================
// ✅ POINTER EVENTS (Double Tap)
// ==========================================

const lastPointerTap = ref(0);
const DOUBLE_TAP_DELAY = 300;

const handlePointerTap = (e) => {
  // Ignore secondary clicks (right click)
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const now = Date.now();
  if (now - lastPointerTap.value < DOUBLE_TAP_DELAY) {
    // Double Tap!
    toggleFavorite();
    lastPointerTap.value = 0;
  } else {
    lastPointerTap.value = now;
  }
};

// ==========================================
// ✅ SHARE
// ==========================================

const shareShop = async () => {
  selectFeedback();
  const shop = props.shop;
  if (!shop) return;

  const shareUrl = `${window.location.origin}/venue/${shop.id}`;
  const shareData = {
    title: shop.name,
    text: `Check out ${shop.name} on VibeCity!`,
    url: shareUrl,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareUrl);
      // Removed alert for cleaner UX, could emit event for toast
    }
    emit("share", { shop, url: shareUrl });
  } catch (err) {
    // Share cancelled or failed
  }
};

// ==========================================
// ✅ VIDEO LOGIC
// ==========================================

const videoElement = ref(null);
const isVideoLoaded = ref(false);
const videoError = ref(false);
const isMuted = ref(true);

const toggleMute = () => {
  if (videoElement.value) {
    isMuted.value = !isMuted.value;
    videoElement.value.muted = isMuted.value;
    selectFeedback();
  }
};

onUnmounted(() => {
  if (videoElement.value) {
    videoElement.value.pause();
    videoElement.value.src = "";
    videoElement.value.load();
  }
});

watch(
  () => props.isActive,
  (active) => {
    if (active) {
      if (props.shop?.id) {
        shopStore.incrementView(props.shop.id);
      }
      if (videoElement.value && isVideoLoaded.value) {
        videoElement.value.play().catch(() => {
          isMuted.value = true;
          if (videoElement.value) {
            videoElement.value.muted = true;
            videoElement.value.play().catch(() => {});
          }
        });
      }
    } else if (videoElement.value) {
      videoElement.value.pause();
    }
  },
  { immediate: true },
);

// ==========================================
// ✅ PHYSICS & DRAG GESTURES
// ==========================================

const container = ref(null);
const touchStartY = ref(0);
const touchStartX = ref(0);
const pullUpDistance = ref(0);
const isDragging = ref(false);
const hasTriggeredSnap = ref(false);

const applyResistance = (diff) => {
  const limit = 200;
  // Logarithmic resistance
  return (1 - Math.exp(-Math.abs(diff) / 300)) * limit;
};

const handleTouchStart = (e) => {
  if (props.isImmersive) return;
  touchStartY.value = e.touches[0].clientY;
  touchStartX.value = e.touches[0].clientX;
  isDragging.value = true;
  hasTriggeredSnap.value = false;
};

const handleTouchMove = (e) => {
  if (!isDragging.value) return;

  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;

  // Use rAF managed internally by browser for touch events usually,
  // but explicit rAF can help sync expensive logic
  requestAnimationFrame(() => {
    const diffY = currentY - touchStartY.value;
    const diffX = currentX - touchStartX.value;

    // Horizontal Swipe Protection (Lock Axis)
    if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (pullUpDistance.value !== 0) pullUpDistance.value = 0;
      return;
    }

    if (diffY < 0) {
      // Pulling Up
      if (e.cancelable) e.preventDefault();
      pullUpDistance.value = applyResistance(diffY);

      // Haptic Snap Feedback
      if (
        pullUpDistance.value > props.threshold * 0.8 &&
        !hasTriggeredSnap.value
      ) {
        impactFeedback("light"); // Crisp snap feel
        hasTriggeredSnap.value = true;
      } else if (
        pullUpDistance.value < props.threshold * 0.8 &&
        hasTriggeredSnap.value
      ) {
        hasTriggeredSnap.value = false;
      }
    }
  });
};

const handleTouchEnd = () => {
  isDragging.value = false;

  // Easier activation (40% threshold)
  if (pullUpDistance.value > props.threshold * 0.4) {
    impactFeedback("medium");
    emit("expand");

    // Smooth reset
    requestAnimationFrame(() => {
      pullUpDistance.value = 0;
    });
  } else {
    // Snap back
    pullUpDistance.value = 0;
  }
};

const handleManualExpand = () => {
  impactFeedback("medium");
  emit("expand");
};

// ==========================================
// ✅ TRANSFORMATIONS
// ==========================================

const cardStyle = computed(() => {
  const progress = Math.min(pullUpDistance.value / props.threshold, 1);
  const scale = 1 - progress * 0.05;

  return {
    transform: `
      translateY(${-pullUpDistance.value}px)
      scale(${scale})
      perspective(1000px)
    `,
    borderRadius: `${24 + progress * 8}px`,
    transition: isDragging.value
      ? "none"
      : "transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), border-radius 0.3s ease",
    willChange: "transform, border-radius",
  };
});

const uiOpacity = computed(() =>
  Math.max(0, 1 - pullUpDistance.value / (props.threshold * 0.6)),
);
</script>

<template>
  <div
    ref="container"
    data-testid="shop-card"
    class="swipe-card-container group relative transition-transform duration-300 pointer-events-auto"
    :class="{ 'z-30': isSelected }"
    @touchstart="handleTouchStart"
    @touchmove.prevent="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
    @pointerdown="handlePointerTap"
  >
    <!-- ✅ Shop Content -->
    <div
      class="swipe-card-content bg-zinc-900 overflow-hidden shadow-2xl relative w-full h-full border border-white/5"
      :style="cardStyle"
    >
      <!-- Media Layer -->
      <div class="absolute inset-0 w-full h-full">
        <!-- Autoplay Video -->
        <video
          v-if="shop?.Video_URL"
          ref="videoElement"
          :src="shop.Video_URL"
          :poster="shop.Image_URL1"
          class="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          :class="{ 'opacity-0': !isVideoLoaded, 'opacity-100': isVideoLoaded }"
          muted
          loop
          playsinline
          preload="none"
          @loadeddata="isVideoLoaded = true"
          @error="videoError = true"
        ></video>

        <!-- Fallback Image -->
        <img
          v-if="!shop?.Video_URL || !isVideoLoaded || videoError"
          :src="shop?.Image_URL1"
          :alt="displayName"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-110"
          :class="{ 'z-10': !isVideoLoaded }"
          loading="lazy"
        />

        <!-- No Image Placeholder (Premium) -->
        <div
          v-if="!shop?.Image_URL1 && !shop?.Video_URL"
          class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center p-6 text-center"
        >
          <div class="flex flex-col items-center gap-3 opacity-40">
            <div
              class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10"
            >
              <ImageOff class="w-8 h-8 text-white/50" />
            </div>
            <span
              class="text-[10px] font-bold uppercase tracking-widest text-white/50"
            >
              No Image Available
            </span>
          </div>
        </div>
      </div>

      <!-- ✅ Cinematic Blooms (Subtle Background Glows) -->
      <div
        class="absolute inset-0 pointer-events-none z-10 mix-blend-overlay opacity-40"
      >
        <div
          class="absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl bg-pink-500/30"
        />
        <div
          class="absolute -bottom-12 -right-12 w-48 h-48 rounded-full blur-3xl bg-cyan-500/30"
        />
      </div>

      <!-- Gradient Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent pointer-events-none z-10"
      ></div>

      <!-- Volume Control -->
      <button
        v-if="shop?.Video_URL && isActive"
        @click.stop="toggleMute"
        class="absolute top-3 right-14 z-30 w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-90 transition-[color,background-color,border-color,transform] hover:bg-black/60 focus-ring"
        :aria-label="isMuted ? 'Unmute video' : 'Mute video'"
      >
        <component :is="isMuted ? VolumeX : Volume2" class="w-5 h-5" />
      </button>

      <!-- Badges & Actions -->
      <div
        class="absolute top-3 left-3 right-3 flex justify-between items-start z-20 pointer-events-none"
      >
        <!-- Status Badges -->
        <div class="flex flex-col gap-2 pointer-events-auto">
          <div
            v-if="shop?.status === 'LIVE'"
            class="px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black animate-pulse shadow-lg backdrop-blur-sm border border-red-400/50 flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
          </div>
          <div
            v-if="shop?.isPromoted"
            class="px-2.5 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[10px] font-black shadow-lg border border-yellow-300/50 flex items-center gap-1"
          >
            🔥 GOLDEN
          </div>
        </div>

        <!-- Quick Actions -->
        <div
          v-if="!isImmersive"
          class="flex flex-col gap-2 pointer-events-auto"
        >
          <button
            @click.stop="toggleFavorite"
            class="w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center border active:scale-90 transition-[color,background-color,border-color,transform] focus-ring"
            :class="
              isFavorite
                ? 'bg-pink-500/60 border-pink-400/50 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]'
                : 'bg-black/40 border-white/10 text-white hover:bg-black/60'
            "
            aria-label="Toggle favorite"
          >
            <Heart class="w-5 h-5" :class="{ 'fill-current': isFavorite }" />
          </button>
          <button
            @click.stop="shareShop"
            class="w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-90 transition-[color,background-color,border-color,transform] hover:bg-black/60 focus-ring"
            aria-label="Share this venue"
          >
            <Share2 class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Heart Animation Overlay -->
      <transition name="heart">
        <div
          v-if="showHeartAnim"
          class="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <Heart
            class="w-20 h-20 text-pink-500 fill-current drop-shadow-2xl"
            style="animation: heartBeat 0.6s ease-out"
          />
        </div>
      </transition>

      <!-- Info Area -->
      <div
        v-if="!isImmersive"
        class="absolute bottom-0 left-0 right-0 p-4 z-20 pb-10"
      >
        <!-- Title & Type -->
        <h4
          class="text-xl font-black text-white leading-tight truncate mb-1 drop-shadow-md"
        >
          {{ displayName }}
        </h4>
        <div class="flex items-center gap-2 mb-2">
          <span
            class="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-bold text-white/90 uppercase backdrop-blur-sm border border-white/5"
          >
            {{ displayCategory }}
          </span>
          <div class="flex items-center gap-1 text-white/80 text-[10px]">
            <Clock class="w-3 h-3" />
            <span>{{ displayTime }}</span>
          </div>
        </div>

        <!-- Rating & Status -->
        <div class="flex items-center gap-3 mb-3">
          <div
            class="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-full border border-white/10 backdrop-blur-sm"
          >
            <span
              class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"
            ></span>
            <span class="text-xs font-bold text-white">{{
              displayRating
            }}</span>
          </div>
          <span
            class="text-[10px] text-green-400 font-bold flex items-center shadow-black drop-shadow-sm"
          >
            ↑ {{ displayDistance }}
          </span>
        </div>

        <!-- CTA Button -->
        <button
          @click.stop="emit('open-ride')"
          class="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-[filter,transform] flex items-center justify-center gap-2 border border-blue-400/30 hover:brightness-110"
        >
          <Car class="w-4 h-4" />
          Ride
        </button>
      </div>
    </div>

    <!-- ✅ Slot for injected content -->
    <slot></slot>

    <!-- ✨ Enhanced Pull Handle -->
    <div
      v-if="showExpand"
      class="absolute bottom-1 left-0 right-0 flex justify-center pointer-events-none transition-opacity duration-300 z-20"
      :style="{ opacity: uiOpacity }"
    >
      <div
        class="w-12 h-1 rounded-full bg-white/40 backdrop-blur-md shadow-sm"
      ></div>
    </div>

    <!-- Release Indicator -->
    <div
      class="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-0"
      :style="{
        opacity:
          pullUpDistance > 40
            ? Math.min(1, (pullUpDistance - 40) / (props.threshold - 40))
            : 0,
        transform: `translateY(${Math.min(0, -pullUpDistance * 0.1)}px) scale(${0.9 + (pullUpDistance / props.threshold) * 0.1})`,
      }"
    >
      <div
        @click.stop="handleManualExpand"
        class="relative px-5 py-2.5 rounded-full bg-black/60 backdrop-blur-xl text-white font-bold text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-2 border border-white/10 cursor-pointer pointer-events-auto hover:scale-105 transition-transform"
      >
        <ChevronUp
          class="w-4 h-4 animate-bounce text-blue-400"
          stroke-width="3"
        />
        <span class="text-white/90">Details</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.swipe-card-container {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  touch-action: pan-x;
  overflow: visible;
  perspective: 1000px;
}

.swipe-card-content {
  position: relative;
  width: 100%;
  height: 100%;
  will-change: transform, border-radius;
  border-radius: 24px;
  backface-visibility: hidden;
  transform: translateZ(0);
  transition:
    background-color 0.3s ease,
    box-shadow 0.3s ease;
}

/* Heart Animation */
.heart-enter-active {
  animation: heartBeat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.heart-leave-active {
  transition: opacity 0.3s ease;
}
.heart-leave-to {
  opacity: 0;
}

@keyframes heartBeat {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
