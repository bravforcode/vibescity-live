// --- C:\vibecity.live\src\components\modal\VibeModal.vue ---

<script setup>
import { useMotion } from "@vueuse/motion";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watchEffect,
} from "vue";
import { useHaptics } from "../../composables/useHaptics";
const { selectFeedback, successFeedback } = useHaptics();
import { Z } from "../../constants/zIndex";
import { getMediaDetails } from "../../utils/linkHelper";

const VisitorCount = defineAsyncComponent(
  () => import("../ui/VisitorCount.vue"),
);

import {
  Car,
  Facebook,
  Heart,
  Instagram,
  Navigation,
  Share2,
  X,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useShopStore } from "../../store/shopStore";
// --- REFACTOR: ใช้ browserUtils และ shopUtils ---
import {
  copyToClipboard,
  isMobileDevice,
  openBoltApp,
  openGoogleMapsDir,
  openGrabApp,
  openLinemanApp,
  shareLocation,
} from "../../utils/browserUtils";
import { getStatusColorClass } from "../../utils/shopUtils";
import ReviewSystem from "../ui/ReviewSystem.vue";

const { t } = useI18n();

const props = defineProps({
  shop: {
    type: Object,
    required: true,
  },
  initialIndex: {
    type: Number,
    default: 0,
  },
});

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=800&q=80";

const emit = defineEmits(["close"]);

// --- Cinematic Motion Logic ---
const modalCard = ref(null);
const { apply } = useMotion(modalCard, {
  initial: {
    y: 0,
    opacity: 0,
    scale: 0.8,
  },
  enter: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      mass: 0.5,
    },
  },
  leave: {
    y: 0,
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 200,
      ease: "easeIn",
    },
  },
});

// Gesture Variables
const touchStart = ref({ y: 0, t: 0 });
const isDragging = ref(false);

const handleTouchStart = (e) => {
  touchStart.value = { y: e.touches[0].clientY, t: Date.now() };
  isDragging.value = true;
};

const handleTouchMove = (e) => {
  if (!isDragging.value) return;
  const deltaY = e.touches[0].clientY - touchStart.value.y;

  // Apply visual transform immediately (1:1 follow or resistance)
  if (deltaY > 0) {
    // Dragging down (closing) - 1:1
    apply({ y: deltaY, scale: 1 - deltaY / 2000 });
  } else {
    // Dragging up (overshoot) - Rubber Banding
    const resistance = Math.sqrt(Math.abs(deltaY)) * 2; // Square root resistance
    apply({ y: -resistance });
  }
};

const handleTouchEnd = (e) => {
  if (!isDragging.value) return;
  isDragging.value = false;

  const deltaY = e.changedTouches[0].clientY - touchStart.value.y;
  const time = Date.now() - touchStart.value.t;
  const velocity = deltaY / time; // px/ms

  // Haptic Feedback
  selectFeedback();

  // Close Condition: Dragged down > 150px OR fast flick down
  if (deltaY > 150 || (deltaY > 50 && velocity > 0.5)) {
    emit("close");
  } else {
    // Snap back to open
    apply("enter");
  }
};

const media = computed(() => getMediaDetails(props.shop.videoUrl));

const processedImages = computed(() => {
  return (props.shop.images || []).map((imgUrl) => getMediaDetails(imgUrl).url);
});

// ✅ Double Tap Logic
const lastTap = ref(0);
const showHeartAnim = ref(false);

const handleDoubleTap = (_e) => {
  const now = Date.now();
  const DOUBLE_TAP_DELAY = 300;

  if (now - lastTap.value < DOUBLE_TAP_DELAY) {
    // Action: Save / Like
    emit("toggle-favorite", props.shop.id);

    // Show Animation
    showHeartAnim.value = true;
    setTimeout(() => { copyStatus.value = ""; }, 1000);


    // Haptic
    successFeedback();
  }

  lastTap.value = now;
};

const zoomedImage = ref(null);
const showRidePopup = ref(false);
const copyStatus = ref("");
const rideLoading = ref("");
const isMobile = ref(false);

// --- ระบบ Countdown โปรโมชั่น (ต้องเก็บไว้ในนี้เพราะมี State เวลาที่เปลี่ยนตลอด) ---
const timeLeft = ref("");
const isPromoActive = ref(false);
let timerInterval = null;

const updateCountdown = () => {
  if (!props.shop.promotionEndtime || !props.shop.promotionInfo) {
    isPromoActive.value = false;
    return;
  }

  const now = new Date();
  const [hours, minutes] = props.shop.promotionEndtime.split(":");

  const target = new Date();
  target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const diff = target - now;
  const maxFlashWindow = 1200000; // 20 นาที

  if (diff <= 0 || diff > maxFlashWindow) {
    isPromoActive.value = false;
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  timeLeft.value = `${mins}:${secs.toString().padStart(2, "0")}`;
  isPromoActive.value = true;
};

onMounted(() => {
  isMobile.value = isMobileDevice();
  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);

  // If opened via swipe and initialIndex is set, show specific image
  if (props.initialIndex > 0 && processedImages.value[props.initialIndex]) {
    handleZoom(processedImages.value[props.initialIndex]);
  }
});

const handleZoom = (img) => {
  zoomedImage.value = img;
};

// --- Media Sync ---
const videoPlayer = ref(null);
watchEffect(() => {
  if (videoPlayer.value && props.shop.initialTime) {
    videoPlayer.value.currentTime = props.shop.initialTime;
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

// --- REFACTOR: เรียกใช้ Utils Function ---
const handleCopy = async (text) => {
  const success = await copyToClipboard(text);
  if (success) {
    copyStatus.value = "Copied!";
    setTimeout(() => { copyStatus.value = ""; }, 1000);

  } else {
    copyStatus.value = "Manual search required";
  }
};

const openGoogleMaps = () => {
  openGoogleMapsDir(props.shop.lat, props.shop.lng);
};

// เปิดแอพ Grab พร้อม feedback
const openGrab = () => {
  rideLoading.value = "grab";

  // Fire-and-forget copy (don't await) to prevent blocking deep link
  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  // Call immediately to satisfy browser security (Synchronous-like intent)
  const success = openGrabApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Grab...";
  } else {
    copyStatus.value = "ไม่พบ Grab";
  }

  // ปิด popup หลังจาก 1.5 วินาที
  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};

// เปิดแอพ Bolt พร้อม feedback
const openBolt = () => {
  rideLoading.value = "bolt";

  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  const success = openBoltApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Bolt...";
  } else {
    copyStatus.value = "ไม่พบ Bolt";
  }

  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};

// เปิดแอพ Lineman
const openLineman = () => {
  rideLoading.value = "lineman";

  copyToClipboard(props.shop.name).then(() => {
    copyStatus.value = "Copied!";
  });

  const success = openLinemanApp(props.shop);

  if (success) {
    copyStatus.value = "กำลังเปิด Lineman...";
  } else {
    copyStatus.value = "ตไม่พบ Lineman";
  }

  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => (copyStatus.value = ""), 1000);
  }, 1500);
};
</script>

<template>
  <div
    data-testid="vibe-modal"
    class="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto font-sans overflow-hidden"
    :style="{ zIndex: Z.MODAL }"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/90 backdrop-blur-sm"
      @click="emit('close')"
    ></div>

    <!-- Main Modal / Bottom Sheet -->
    <div
      ref="modalCard"
      @touchstart.stop="handleTouchStart"
      @touchmove.stop="handleTouchMove"
      @touchend.stop="handleTouchEnd"
      class="relative w-full max-w-5xl m-auto bg-zinc-950/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 flex flex-col md:flex-row shadow-[0_20px_100px_rgba(0,0,0,0.8)] h-[92vh] max-h-[92vh] md:h-[90vh] pointer-events-auto overflow-hidden"
      :style="{ zIndex: Z.MODAL }"
    >
      <!-- Top Interaction Area (Close Shortcut) -->
      <div
        @click="
          emit('close');
          selectFeedback();
        "
        class="absolute top-4 right-4 z-[4000] p-2 bg-white/10 backdrop-blur-xl rounded-full border border-white/20 active:scale-90 transition-all pointer-events-auto cursor-pointer"
      >
        <X class="w-6 h-6 text-white" />
      </div>

      <!-- Drag Handle (Visual only now, or for vertical dismiss resistance) -->
      <div class="w-full flex justify-center py-4 pointer-events-none">
        <div class="w-12 h-1.5 bg-white/10 rounded-full"></div>
      </div>

      <div
        :class="[
          'relative w-full flex flex-col overflow-hidden transition-all duration-300',
          shop.isPromoted || shop.IsPromoted === 'TRUE'
            ? 'shadow-[0_0_40px_rgba(250,204,21,0.1)]'
            : shop.status === 'LIVE'
              ? 'shadow-[0_0_40px_rgba(34,211,238,0.1)]'
              : '',
        ]"
      >
        <!-- Header -->
        <div class="px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10">
          <div class="flex items-start justify-between gap-2 sm:gap-4">
            <div class="flex-1 text-left min-w-0">
              <h2
                class="text-lg sm:text-2xl font-black text-white uppercase tracking-tighter leading-tight break-words"
              >
                {{ shop.name }}
              </h2>
              <div class="mt-2 flex">
                <VisitorCount
                  :shopId="shop.id"
                  :initialCount="Math.floor(Math.random() * 50) + 10"
                />
              </div>
            </div>

            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <div class="flex flex-wrap justify-end gap-1.5">
                <transition name="fade">
                  <div
                    v-if="isPromoActive"
                    class="promo-status-badge font-black rounded-md uppercase tracking-wider text-white shrink-0 text-[10px] sm:text-[12px] px-2 py-1 sm:px-2.5 sm:py-1"
                  >
                    FLASH SALE
                  </div>
                </transition>
                <transition name="fade">
                  <div
                    v-if="shop.isPromoted || shop.IsPromoted === 'TRUE'"
                    class="px-2 py-1 text-[10px] sm:text-[11px] font-black rounded-md uppercase tracking-tighter bg-gradient-to-r from-yellow-400 to-amber-600 text-black shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                  >
                    PROMOTED
                  </div>
                </transition>
                <div
                  :class="[
                    'px-2 py-1 sm:px-2.5 sm:py-1 text-[10px] sm:text-[12px] font-black rounded-md uppercase tracking-wider text-white shadow-lg shrink-0 flex items-center gap-1.5',
                    getStatusColorClass(shop.status),
                  ]"
                >
                  <span
                    v-if="shop.status === 'LIVE'"
                    class="w-2 h-2 rounded-full bg-white animate-pulse"
                  ></span>
                  {{ shop.status }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Media Section (Updated for Double Tap & Landscape) -->
        <div
          class="relative w-full aspect-video md:aspect-auto md:w-[70%] md:h-full bg-zinc-900 overflow-hidden flex-shrink-0 group"
          @touchstart.stop="handleDoubleTap"
          @click.stop="handleDoubleTap"
        >
          <!-- Heart Animation -->
          <transition name="pop">
            <div
              v-if="showHeartAnim"
              class="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <Heart
                class="w-32 h-32 text-pink-500 fill-current drop-shadow-2xl animate-ping"
              />
            </div>
          </transition>

          <div
            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-40"
          >
            <span
              class="bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur"
              >Double tap to save ❤️</span
            >
          </div>

          <transition name="fade">
            <div
              v-if="isPromoActive"
              class="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-[3100] bg-gradient-to-r from-red-600 to-orange-600 p-3 sm:p-3 shadow-[0_4px_20px_rgba(220,38,38,0.6)] animate-pulse-slow border-l-[4px] border-white"
            >
              <div class="flex flex-col items-start">
                <span
                  class="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-[0.2em] leading-none mb-1"
                  >Limited Deal</span
                >
                <h3
                  class="text-base sm:text-lg font-black text-white tracking-tighter leading-none italic uppercase"
                >
                  {{ shop.promotionInfo }}
                </h3>
                <div
                  class="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 bg-black/40 px-2 py-1 rounded-sm"
                >
                  <span
                    class="text-[10px] sm:text-[11px] font-mono font-bold text-red-100 tracking-[0.1em]"
                    >ENDS IN: {{ timeLeft }}</span
                  >
                </div>
              </div>
            </div>
          </transition>

          <video
            ref="videoPlayer"
            v-if="!zoomedImage && media.type === 'video'"
            :src="media.url"
            autoplay
            loop
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <iframe
            v-else-if="!zoomedImage && media.type === 'youtube'"
            :src="media.url"
            class="w-full h-full scale-[1]"
            frameborder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
          ></iframe>
          <img
            v-else
            :src="zoomedImage || media.url || FALLBACK_IMAGE"
            class="w-full h-full object-cover"
          />
        </div>

        <!-- Content -->
        <div
          class="p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-y-auto no-scrollbar"
        >
          <div class="flex flex-row justify-between items-start gap-3">
            <div class="flex-1 space-y-3 sm:space-y-2 text-left min-w-0">
              <div
                class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2"
              >
                <span
                  class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0"
                  >Crowd:</span
                >
                <p
                  class="text-[13px] sm:text-[15px] font-medium text-white/90 leading-snug break-words"
                >
                  {{ shop.crowdInfo || "-" }}
                </p>
              </div>
              <div
                class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2"
              >
                <span
                  class="text-[10px] sm:text-[11px] text-white/30 font-bold uppercase tracking-[0.15em] shrink-0"
                  >Vibe:</span
                >
                <p
                  class="text-[13px] sm:text-[15px] font-medium text-white/90 leading-snug break-words"
                >
                  {{ shop.vibeTag || "-" }}
                </p>
              </div>
            </div>

            <div
              class="flex flex-row gap-2 shrink-0 overflow-x-auto no-scrollbar pb-1"
              v-if="processedImages.length > 0"
            >
              <div
                v-for="(img, idx) in processedImages"
                :key="idx"
                @click="handleZoom(img)"
                class="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden border border-white/10 cursor-pointer active:scale-95 transition-all shadow-lg bg-zinc-900 flex-shrink-0"
              >
                <img
                  :src="img"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <!-- ✅ Social Presence (New for Entertainment Map Concept) -->
          <div
            v-if="shop.IG_URL || shop.FB_URL || shop.TikTok_URL"
            class="border-t border-white/5 pt-4"
          >
            <h4
              class="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 text-left"
            >
              Explore Atmosphere
            </h4>
            <div class="flex gap-2.5">
              <a
                v-if="shop.IG_URL"
                :href="shop.IG_URL"
                target="_blank"
                class="flex-1 py-3 px-2 rounded-2xl bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl group"
              >
                <Instagram class="w-4 h-4 text-white" />
                <span
                  class="text-[10px] font-black text-white uppercase tracking-tighter"
                  >IG</span
                >
              </a>
              <a
                v-if="shop.FB_URL"
                :href="shop.FB_URL"
                target="_blank"
                class="flex-1 py-3 px-2 rounded-2xl bg-[#1877F2] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl group"
              >
                <Facebook class="w-4 h-4 text-white" />
                <span
                  class="text-[10px] font-black text-white uppercase tracking-tighter"
                  >FB</span
                >
              </a>
              <a
                v-if="shop.TikTok_URL"
                :href="shop.TikTok_URL"
                target="_blank"
                class="flex-1 py-3 px-2 rounded-2xl bg-black border border-white/20 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl group"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path>
                </svg>
                <span
                  class="text-[10px] font-black text-white uppercase tracking-tighter"
                  >TikTok</span
                >
              </a>
            </div>
          </div>

          <!-- ✅ REVIEW SYSTEM (PHASE 3) -->
          <div class="border-t border-white/5 pt-4">
            <ReviewSystem :shop-id="shop.id" :shop-name="shop.name" />
          </div>
        </div>

        <!-- Action Buttons -->
        <div
          class="p-5 sm:p-6 pt-0 grid grid-cols-3 gap-2 sm:gap-3 flex-shrink-0"
        >
          <!-- แชร์ -->
          <button
            @click="handleShare"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <Share2 class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10" />
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              แชร์
            </span>
          </button>

          <!-- Google Maps -->
          <button
            @click="openGoogleMaps"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <Navigation
              class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10"
            />
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              นำทาง
            </span>
          </button>

          <!-- เรียกรถ -->
          <button
            @click="showRidePopup = true"
            class="h-12 sm:h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl sm:rounded-2xl transition-all active:scale-95 shadow-lg shadow-green-900/20 group relative overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
            ></div>
            <Car class="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10" />
            <span
              class="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest relative z-10"
            >
              เรียกรถ
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- ✅ Ride Popup -->
    <transition name="fade">
      <div
        v-if="showRidePopup"
        class="fixed inset-0 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
        :style="{ zIndex: Z.SUBMODAL }"
        @click.self="showRidePopup = false"
      >
        <div
          class="w-full max-w-[320px] bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl animate-pop relative"
        >
          <!-- Close Button -->
          <button
            @click="showRidePopup = false"
            class="absolute top-4 right-4 text-white/50 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-full p-2"
          >
            <X class="w-5 h-5" />
          </button>

          <div class="mb-6 text-center">
            <div
              class="w-14 h-14 mx-auto mb-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2m2 0h10"
                />
                <circle cx="7" cy="17" r="2" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </div>
            <h3 class="text-lg font-black text-white uppercase tracking-tight">
              เรียกรวดเร็ว
            </h3>
            <p class="text-[11px] text-white/60 font-medium mt-1">
              {{ shop.name }}
            </p>
          </div>

          <div class="flex flex-col gap-3">
            <!-- Grab -->
            <button
              @click="openGrab"
              :disabled="rideLoading === 'grab'"
              class="w-full h-14 bg-gradient-to-r from-[#00B14F] to-[#00A84D] hover:from-[#009e47] hover:to-[#009441] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-green-600 font-bold text-xs"
                  >
                    G
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "grab" ? "กำลังเปิด..." : "Grab" }}
                </span>
              </div>
            </button>

            <!-- Bolt -->
            <button
              @click="openBolt"
              :disabled="rideLoading === 'bolt'"
              class="w-full h-14 bg-gradient-to-r from-[#34D186] to-[#2EC477] hover:from-[#2bc87d] hover:to-[#26b572] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-[#34D186] font-bold text-xs"
                  >
                    B
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "bolt" ? "กำลังเปิด..." : "Bolt" }}
                </span>
              </div>
            </button>

            <!-- Lineman -->
            <button
              @click="openLineman"
              :disabled="rideLoading === 'lineman'"
              class="w-full h-14 bg-gradient-to-r from-[#00B14F] to-[#009440] hover:from-[#009e47] hover:to-[#008439] rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all duration-200 group relative overflow-hidden border-l-4 border-green-400"
            >
              <div
                class="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all duration-300"
              ></div>
              <div class="relative z-10 flex items-center justify-center gap-3">
                <div class="bg-white p-2 rounded-full">
                  <div
                    class="w-5 h-5 flex items-center justify-center text-green-600 font-bold text-xs"
                  >
                    L
                  </div>
                </div>
                <span class="font-bold text-white text-base tracking-wide">
                  {{ rideLoading === "lineman" ? "กำลังเปิด..." : "Lineman" }}
                </span>
              </div>
            </button>
          </div>

          <div class="mt-6 text-center border-t border-white/10 pt-4">
            <transition name="fade">
              <p
                v-if="copyStatus"
                class="text-xs font-bold text-green-400 uppercase animate-pulse"
              >
                {{ copyStatus }}
              </p>
            </transition>
            <p class="text-[10px] text-white/40 mt-2 italic" v-if="isMobile">
              * ถ้าแอพไม่เปิดอัตโนมัติ กรุณาเปิดแอพด้วยตนเอง
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Zoomed Image -->
    <transition name="fade">
      <div
        v-if="zoomedImage"
        class="fixed inset-0 flex items-center justify-center p-6 bg-black/95 backdrop-blur-md cursor-pointer"
        :style="{ zIndex: Z.SUBMODAL }"
        @click="zoomedImage = null"
      >
        <img
          :src="zoomedImage"
          class="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-2xl object-contain animate-zoom"
        />
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Existing styles remain */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-slide-up {
  animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.animate-pop {
  animation: pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes zoom {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-zoom {
  animation: zoom 0.2s ease-out forwards;
}

.promo-status-badge {
  background: linear-gradient(270deg, #ff4d4d, #f97316, #ff4d4d);
  background-size: 200% 200%;
  animation: wave-gradient 2s linear infinite;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

@keyframes wave-gradient {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

.animate-pulse-slow {
  animation: pulse-slow 3s infinite;
}
@keyframes pulse-slow {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.95;
    transform: scale(1.03);
  }
}

/* ปุ่ม disabled */
button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
