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
import { Z } from "../../constants/zIndex";
import { getMediaDetails } from "../../utils/linkHelper";

// ✅ Lazy Load Components
const VisitorCount = defineAsyncComponent(
  () => import("../ui/VisitorCount.vue"),
);
const ReviewSystem = defineAsyncComponent(
  () => import("../ui/ReviewSystem.vue"),
);

import {
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  Facebook,
  Heart,
  Instagram,
  MapPin,
  Navigation,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import {
  openBoltApp,
  openGrabApp,
  openLinemanApp,
} from "../../services/DeepLinkService";
import {
  copyToClipboard,
  isMobileDevice,
  openGoogleMapsDir,
  shareLocation,
} from "../../utils/browserUtils";
import { getStatusColorClass } from "../../utils/shopUtils";

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
  userCount: {
    type: Number,
    default: null,
  },
});

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=800&q=80";

const emit = defineEmits(["close", "toggle-favorite"]);

// ✅ Initialize haptics within setup scope
const { selectFeedback, successFeedback, impactFeedback } = useHaptics();

// ✅ Stable random visitor count (generated once on mount, not inline)
const initialVisitorCount = ref(null);

// ✅ Smooth Exit Logic
const handleClose = async () => {
  impactFeedback("medium");

  // Trigger animations
  apply("leave");

  // Wait for animation (350ms duration)
  setTimeout(() => {
    emit("close");
  }, 300);
};

// ==========================================
// ✅ iOS-STYLE MOTION SYSTEM
// ==========================================

const modalCard = ref(null);
const { apply } = useMotion(modalCard, {
  initial: {
    y: "100%",
    opacity: 0,
    scale: 0.95,
  },
  enter: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 30,
      mass: 0.8,
    },
  },
  leave: {
    y: "100%",
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 350,
      ease: [0.25, 0.1, 0.25, 1], // iOS default easing
    },
  },
});

// ==========================================
// ✅ ENHANCED SWIPE GESTURE SYSTEM (S-TIER PHYSICS)
// ==========================================

const touchStart = ref({ y: 0, t: 0 });
const isDragging = ref(false);
const dragProgress = ref(0);
const scrollContentRef = ref(null);
const initialScrollTop = ref(0);

const handleTouchStart = (e) => {
  // Capture scroll position at start of touch
  if (scrollContentRef.value) {
    initialScrollTop.value = scrollContentRef.value.scrollTop;
  }

  touchStart.value = { y: e.touches[0].clientY, t: Date.now() };
  isDragging.value = true;
  // Don't trigger haptics immediately on touch start to prevent noise
};

const handleTouchMove = (e) => {
  if (!isDragging.value) return;

  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStart.value.y;

  // ⛔️ BLOCKER 1: If we started scrolled down, NEVER drag
  if (initialScrollTop.value > 0) return;

  // ⛔️ BLOCKER 2: If we are currently scrolling content, NEVER drag
  if (scrollContentRef.value && scrollContentRef.value.scrollTop > 0) return;

  // ⛔️ BLOCKER 3: If dragging UP (scrolling content), allow native scroll
  if (deltaY < 0) return;

  // ✅ ACTIVE DRAG (At top, pulling down)
  if (e.cancelable && deltaY > 0) {
    e.preventDefault(); // Stop native pull-to-refresh or rubberband

    // Logarithmic Resistance (iOS feel)
    // Formula: y = limit * log(1 + x / limit)
    // This gives a heavy, satisfying feel that gets harder the further you pull
    const limit = 200;
    const resistance = limit * Math.log10(1 + deltaY / (limit * 0.5)) * 2.5;

    dragProgress.value = Math.min(deltaY / 600, 1);

    apply({
      y: resistance,
      scale: 1 - deltaY / 3000, // Very subtle scale
      opacity: 1, // Keep full opacity until release/threshold
    });
  }
};

const handleTouchEnd = (e) => {
  if (!isDragging.value) return;
  isDragging.value = false;

  const currentY = e.changedTouches[0].clientY;
  const deltaY = currentY - touchStart.value.y;
  const time = Date.now() - touchStart.value.t;
  const velocity = deltaY / time; // px/ms

  // Only consider for dismissal if we were correctly in drag mode
  // (i.e., we have some positive translation)
  // We check deltaY > 0 to ensure we only close on "Pull Down"

  const isScrolledToTop =
    !scrollContentRef.value || scrollContentRef.value.scrollTop <= 0;

  if (isScrolledToTop && deltaY > 0) {
    // Dismiss conditions:
    // 1. Fast flick (> 0.5px/ms)
    // 2. Long drag (> 100px)
    if ((deltaY > 60 && velocity > 0.5) || deltaY > 150) {
      impactFeedback("medium");
      apply("leave"); // ✅ Use leave animation instead of direct emit
      setTimeout(() => emit("close"), 300);
      return; // Exit, don't snap back
    }
  }

  // Snap back (Reset)
  if (deltaY > 0) {
    apply("enter");
  }

  dragProgress.value = 0;
};

// ==========================================
// ✅ MEDIA CAROUSEL SYSTEM
// ==========================================

const media = computed(() => getMediaDetails(props.shop.videoUrl));

const processedImages = computed(() => {
  return (props.shop.images || []).map((imgUrl) => getMediaDetails(imgUrl).url);
});

const currentImageIndex = ref(0);
const imageCarouselRef = ref(null);

const nextImage = () => {
  if (currentImageIndex.value < processedImages.value.length - 1) {
    currentImageIndex.value++;
    scrollToImage(currentImageIndex.value);
    impactFeedback("light");
  }
};

const prevImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--;
    scrollToImage(currentImageIndex.value);
    impactFeedback("light");
  }
};

const scrollToImage = (index) => {
  if (!imageCarouselRef.value) return;
  const container = imageCarouselRef.value;
  const itemWidth = container.clientWidth;
  container.scrollTo({
    left: itemWidth * index,
    behavior: "smooth",
  });
};

// ==========================================
// ✅ DOUBLE TAP TO LIKE
// ==========================================

const lastTap = ref(0);
const showHeartAnim = ref(false);

const handleDoubleTap = () => {
  const now = Date.now();
  const DOUBLE_TAP_DELAY = 300;

  if (now - lastTap.value < DOUBLE_TAP_DELAY) {
    emit("toggle-favorite", props.shop.id);
    showHeartAnim.value = true;
    successFeedback();

    setTimeout(() => {
      showHeartAnim.value = false;
    }, 1000);
  }

  lastTap.value = now;
};

// ==========================================
// ✅ RIDE APP SYSTEM
// ==========================================

const showRidePopup = ref(false);
const copyStatus = ref("");
const rideLoading = ref("");
const isMobile = ref(false);

const openRide = (appName) => {
  rideLoading.value = appName;
  impactFeedback("medium");

  // Copy shop name to clipboard with error handling
  copyToClipboard(props.shop.name)
    .then(() => {
      copyStatus.value = "📋 Copied!";
    })
    .catch((err) => {
      console.warn("Copy to clipboard failed:", err);
      copyStatus.value = "⚠️ Could not copy name";
    });

  let success = false;
  try {
    switch (appName) {
      case "grab":
        success = openGrabApp(props.shop);
        break;
      case "bolt":
        success = openBoltApp(props.shop);
        break;
      case "lineman":
        success = openLinemanApp(props.shop);
        break;
      default:
        success = false;
        copyStatus.value = "❌ Unknown app";
    }

    if (success) {
      copyStatus.value = `🚗 Opening ${appName}...`;
    } else if (!copyStatus.value.includes("Unknown")) {
      copyStatus.value = "❌ App not found";
    }
  } catch (err) {
    console.error("Error opening ride app:", err);
    success = false;
    copyStatus.value = "❌ Failed to open app";
  }

  setTimeout(() => {
    showRidePopup.value = false;
    rideLoading.value = "";
    setTimeout(() => {
      copyStatus.value = "";
    }, 1000);
  }, 1500);
};

// ==========================================
// ✅ PROMOTION COUNTDOWN
// ==========================================

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
  target.setHours(Number.parseInt(hours), Number.parseInt(minutes), 0, 0);

  const diff = target - now;
  const maxFlashWindow = 1200000; // 20 min

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

// ==========================================
// ✅ SHARE SYSTEM
// ==========================================

const handleShare = async () => {
  impactFeedback("medium");
  const success = await shareLocation(
    props.shop.name,
    props.shop.lat,
    props.shop.lng,
  );

  if (success) {
    copyStatus.value = "✅ Shared!";
    successFeedback();
  } else {
    copyStatus.value = "📋 Link copied!";
  }

  setTimeout(() => {
    copyStatus.value = "";
  }, 2000);
};

const openGoogleMaps = () => {
  impactFeedback("medium");
  openGoogleMapsDir(props.shop.lat, props.shop.lng);
};

// ==========================================
// ✅ LAZY LOADING SYSTEM
// ==========================================

const isMediaVisible = ref(false);
const isReviewsVisible = ref(false);
const mediaObserver = ref(null);
const reviewsObserver = ref(null);

const setupIntersectionObservers = () => {
  // Media Observer
  mediaObserver.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isMediaVisible.value = true;
        }
      });
    },
    { threshold: 0.1 },
  );

  // Reviews Observer
  reviewsObserver.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isReviewsVisible.value = true;
        }
      });
    },
    { threshold: 0.1 },
  );

  nextTick(() => {
    const mediaEl = document.querySelector("#media-container");
    const reviewsEl = document.querySelector("#reviews-container");

    if (mediaEl) mediaObserver.value.observe(mediaEl);
    if (reviewsEl) reviewsObserver.value.observe(reviewsEl);
  });
};

// ==========================================
// ✅ VIDEO SYNC
// ==========================================

const videoPlayer = ref(null);
watchEffect(() => {
  if (videoPlayer.value && props.shop.initialTime) {
    videoPlayer.value.currentTime = props.shop.initialTime;
  }
});

// ==========================================
// ✅ LIFECYCLE
// ==========================================

onMounted(() => {
  isMobile.value = isMobileDevice();
  initialVisitorCount.value = Math.floor(Math.random() * 50) + 10; // ✅ Generate stable random count
  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);
  setupIntersectionObservers();

  // ✅ Add scroll listener for carousel index sync
  if (imageCarouselRef.value) {
    imageCarouselRef.value.addEventListener("scroll", handleCarouselScroll);
  }
});

// ✅ Carousel scroll handler to sync currentImageIndex
const handleCarouselScroll = () => {
  if (!imageCarouselRef.value) return;
  const container = imageCarouselRef.value;
  const newIndex = Math.round(container.scrollLeft / container.clientWidth);
  if (
    newIndex !== currentImageIndex.value &&
    newIndex >= 0 &&
    newIndex < processedImages.value.length
  ) {
    currentImageIndex.value = newIndex;
  }
};

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (mediaObserver.value) mediaObserver.value.disconnect();
  if (reviewsObserver.value) reviewsObserver.value.disconnect();
  // ✅ Cleanup carousel scroll listener
  if (imageCarouselRef.value) {
    imageCarouselRef.value.removeEventListener("scroll", handleCarouselScroll);
  }
});
</script>

<template>
  <div
    data-testid="vibe-modal"
    class="fixed inset-0 flex items-end md:items-center justify-center pointer-events-auto font-sans overflow-hidden"
    :style="{ zIndex: Z.MODAL }"
  >
    <!-- ✅ iOS-Style Backdrop with Blur -->
    <div
      class="absolute inset-0 bg-black/70 backdrop-blur-xl transition-opacity duration-300"
      :style="{ opacity: 1 - dragProgress * 0.5 }"
      @click="handleClose"
    ></div>

    <!-- ✅ Main Modal Container - iOS Bottom Sheet Style -->
    <div
      ref="modalCard"
      @touchstart.stop="handleTouchStart"
      @touchmove.stop="handleTouchMove"
      @touchend.stop="handleTouchEnd"
      class="relative w-full md:max-w-5xl bg-white dark:bg-zinc-900 md:rounded-[2rem] rounded-t-[2rem] flex flex-col shadow-[0_-10px_80px_rgba(0,0,0,0.3)] max-h-[94vh] md:max-h-[90vh] pointer-events-auto overflow-hidden"
      :style="{
        zIndex: Z.MODAL,
        '--safe-area-top': 'env(safe-area-inset-top)',
        '--safe-area-bottom': 'env(safe-area-inset-bottom)',
      }"
    >
      <!-- ✅ iOS-Style Drag Handle -->
      <div
        class="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
      >
        <div
          class="w-10 h-1 bg-gray-300 dark:bg-gray-500 rounded-full transition-all duration-200"
          :style="{
            width: dragProgress > 0 ? `${10 + dragProgress * 20}px` : '40px',
            backgroundColor: dragProgress > 0.3 ? '#10b981' : undefined,
          }"
        ></div>
      </div>

      <!-- ✅ Close Button (iOS-style) -->
      <button
        @click="handleClose"
        aria-label="Close details"
        class="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 backdrop-blur-xl border border-white/20 active:scale-90 transition-all"
      >
        <X class="w-5 h-5 text-gray-700 dark:text-white" />
      </button>

      <!-- ✅ Scrollable Content -->
      <div
        ref="scrollContentRef"
        class="flex-1 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch"
      >
        <!-- ✅ Header Section -->
        <div class="px-5 py-4 space-y-3">
          <!-- Title Row -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <h2
                class="text-2xl font-black text-gray-900 dark:text-white leading-tight break-words"
              >
                {{ shop.name }}
              </h2>
              <div
                class="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
              >
                <MapPin class="w-4 h-4" />
                <span class="font-medium">{{
                  shop.category || "Entertainment"
                }}</span>
              </div>
            </div>

            <!-- Status Badges -->
            <div class="flex flex-col gap-1.5 shrink-0">
              <transition name="scale">
                <div
                  v-if="isPromoActive"
                  class="px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-wider text-white bg-gradient-to-r from-red-500 to-orange-500 shadow-lg animate-pulse"
                >
                  🔥 FLASH
                </div>
              </transition>

              <transition name="scale">
                <div
                  v-if="shop.isPromoted || shop.IsPromoted === 'TRUE'"
                  class="px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tight bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg"
                >
                  ⭐ HOT
                </div>
              </transition>

              <div
                :class="[
                  'px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-wide text-white shadow-lg flex items-center gap-1.5',
                  getStatusColorClass(shop.status),
                ]"
              >
                <span
                  v-if="shop.status === 'LIVE'"
                  class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
                ></span>
                {{ shop.status }}
              </div>
            </div>
          </div>

          <!-- Visitor Count -->
          <VisitorCount
            v-if="isMediaVisible"
            :shopId="shop.id"
            :initialCount="initialVisitorCount"
            :liveCount="userCount"
          />
        </div>

        <!-- ✅ Media Section with Lazy Loading -->
        <div
          id="media-container"
          class="relative w-full aspect-[16/10] bg-gray-100 dark:bg-zinc-800 overflow-hidden"
          @touchstart.stop="handleDoubleTap"
        >
          <!-- Loading Skeleton -->
          <div
            v-if="!isMediaVisible"
            class="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-zinc-700 dark:to-zinc-800 animate-pulse"
          ></div>

          <!-- Heart Animation -->
          <transition name="heart">
            <div
              v-if="showHeartAnim"
              class="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <Heart
                class="w-24 h-24 text-pink-500 fill-current drop-shadow-2xl"
                style="animation: heartBeat 0.6s ease-out"
              />
            </div>
          </transition>

          <!-- Double Tap Hint -->
          <div
            class="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-md text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Double tap to like ❤️
          </div>

          <!-- Promotion Badge -->
          <transition name="slide-up">
            <div
              v-if="isPromoActive"
              class="absolute bottom-3 left-3 z-10 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl p-3 shadow-2xl border-l-4 border-white/50"
            >
              <div class="flex flex-col">
                <span
                  class="text-[9px] font-bold text-white/80 uppercase tracking-widest"
                >
                  Limited Deal
                </span>
                <h3 class="text-sm font-black text-white mt-0.5 leading-tight">
                  {{ shop.promotionInfo }}
                </h3>
                <div
                  class="mt-1.5 flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded-md"
                >
                  <Clock class="w-3 h-3 text-white" />
                  <span class="text-[10px] font-mono font-bold text-white">
                    {{ timeLeft }}
                  </span>
                </div>
              </div>
            </div>
          </transition>

          <!-- Media Content -->
          <template v-if="isMediaVisible">
            <video
              ref="videoPlayer"
              v-if="media.type === 'video'"
              :src="media.url"
              autoplay
              loop
              muted
              playsinline
              class="w-full h-full object-cover"
            ></video>
            <iframe
              v-else-if="media.type === 'youtube'"
              :src="media.url"
              class="w-full h-full"
              frameborder="0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
              loading="lazy"
            ></iframe>
            <img
              v-else
              :src="media.url || FALLBACK_IMAGE"
              :alt="props.shop.name || 'Venue image'"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </template>
        </div>

        <!-- ✅ Image Gallery Carousel (iOS-style) -->
        <div v-if="processedImages.length > 0" class="relative px-5 py-4">
          <h4
            class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3"
          >
            Gallery ({{ processedImages.length }})
          </h4>

          <div class="relative">
            <!-- Carousel Container -->
            <div
              ref="imageCarouselRef"
              class="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
            >
              <div
                v-for="(img, idx) in processedImages"
                :key="idx"
                class="flex-shrink-0 w-32 h-32 rounded-2xl overflow-hidden bg-gray-100 dark:bg-zinc-800 snap-start"
              >
                <img
                  :src="img"
                  :alt="`${shop.name} gallery image ${idx + 1}`"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>

            <!-- Navigation Buttons -->
            <button
              v-if="currentImageIndex > 0"
              @click="prevImage"
              aria-label="Previous image"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-md shadow-lg active:scale-90 transition-all"
            >
              <ChevronLeft class="w-5 h-5 text-gray-700 dark:text-white" />
            </button>

            <button
              v-if="currentImageIndex < processedImages.length - 1"
              @click="nextImage"
              aria-label="Next image"
              class="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 dark:bg-black/50 backdrop-blur-md shadow-lg active:scale-90 transition-all"
            >
              <ChevronRight class="w-5 h-5 text-gray-700 dark:text-white" />
            </button>
          </div>
        </div>

        <!-- ✅ Info Cards (iOS-style) -->
        <div class="px-5 py-4 space-y-3">
          <!-- Crowd Info -->
          <div
            class="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 backdrop-blur-sm"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0"
              >
                <Users class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h5
                  class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
                >
                  Crowd Vibe
                </h5>
                <p
                  class="text-sm font-medium text-gray-900 dark:text-white leading-relaxed"
                >
                  {{ shop.crowdInfo || "Mixed crowd, all ages welcome" }}
                </p>
              </div>
            </div>
          </div>

          <!-- Vibe Tag -->
          <div
            class="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 backdrop-blur-sm"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0"
              >
                <Sparkles
                  class="w-5 h-5 text-purple-600 dark:text-purple-400"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h5
                  class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1"
                >
                  Atmosphere
                </h5>
                <p
                  class="text-sm font-medium text-gray-900 dark:text-white leading-relaxed"
                >
                  {{ shop.vibeTag || "Chill and relaxed atmosphere" }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ✅ Social Links (iOS-style) -->
        <div
          v-if="shop.IG_URL || shop.FB_URL || shop.TikTok_URL"
          class="px-5 py-4"
        >
          <h4
            class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3"
          >
            Explore Atmosphere
          </h4>
          <div class="grid grid-cols-3 gap-2">
            <a
              v-if="shop.IG_URL"
              :href="shop.IG_URL"
              target="_blank"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
            >
              <Instagram class="w-5 h-5 text-white" />
              <span class="text-xs font-bold text-white">IG</span>
            </a>

            <a
              v-if="shop.FB_URL"
              :href="shop.FB_URL"
              target="_blank"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-[#1877F2] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
            >
              <Facebook class="w-5 h-5 text-white" />
              <span class="text-xs font-bold text-white">FB</span>
            </a>

            <a
              v-if="shop.TikTok_URL"
              :href="shop.TikTok_URL"
              target="_blank"
              @click="impactFeedback('medium')"
              class="h-12 rounded-2xl bg-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg border border-white/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path>
              </svg>
              <span class="text-xs font-bold text-white">TT</span>
            </a>
          </div>
        </div>

        <!-- ✅ Reviews Section (Lazy Loaded) -->
        <div id="reviews-container" class="px-5 py-4">
          <ReviewSystem
            v-if="isReviewsVisible"
            :shop-id="shop.id"
            :shop-name="shop.name"
          />
        </div>

        <!-- Bottom Safe Area -->
        <div class="h-[calc(var(--safe-area-bottom)+20px)]"></div>
      </div>

      <!-- ✅ iOS-Style Action Bar (Sticky Bottom) -->
      <div
        class="border-t border-gray-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl"
      >
        <div class="px-5 py-3 grid grid-cols-3 gap-2">
          <!-- Share -->
          <button
            @click="handleShare"
            class="h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-lg"
          >
            <Share2 class="w-5 h-5 text-white" />
            <span
              class="text-[10px] font-bold text-white uppercase tracking-wide"
              >Share</span
            >
          </button>

          <!-- Navigate -->
          <button
            @click="openGoogleMaps"
            class="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-lg"
          >
            <Navigation class="w-5 h-5 text-white" />
            <span
              class="text-[10px] font-bold text-white uppercase tracking-wide"
              >Navigate</span
            >
          </button>

          <!-- Ride -->
          <button
            @click="
              showRidePopup = true;
              impactFeedback('medium');
            "
            class="h-14 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-lg"
          >
            <Car class="w-5 h-5 text-white" />
            <span
              class="text-[10px] font-bold text-white uppercase tracking-wide"
              >Ride</span
            >
          </button>
        </div>

        <!-- Safe Area Bottom Padding -->
        <div class="h-[var(--safe-area-bottom)]"></div>
      </div>
    </div>

    <!-- ✅ Ride Selection Bottom Sheet -->
    <transition name="sheet">
      <div
        v-if="showRidePopup"
        class="fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-xl"
        :style="{ zIndex: Z.SUBMODAL }"
        @click.self="showRidePopup = false"
      >
        <div
          class="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-[2rem] shadow-2xl"
        >
          <!-- Drag Handle -->
          <div class="flex justify-center pt-3 pb-1">
            <div
              class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"
            ></div>
          </div>

          <div class="px-5 py-4">
            <!-- Header -->
            <div class="text-center mb-6">
              <div
                class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-xl"
              >
                <Car class="w-8 h-8 text-white" />
              </div>
              <h3 class="text-xl font-black text-gray-900 dark:text-white">
                Book a Ride
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {{ shop.name }}
              </p>
            </div>

            <!-- Ride Options -->
            <div class="space-y-3 mb-6">
              <!-- Grab -->
              <button
                @click="openRide('grab')"
                :disabled="rideLoading === 'grab'"
                aria-label="Open Grab"
                class="w-full h-16 bg-gradient-to-r from-[#00B14F] to-[#00A84D] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-all shadow-lg"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#00B14F]">G</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{ rideLoading === "grab" ? "Opening..." : "Grab" }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>

              <!-- Bolt -->
              <button
                @click="openRide('bolt')"
                :disabled="rideLoading === 'bolt'"
                aria-label="Open Bolt"
                class="w-full h-16 bg-gradient-to-r from-[#34D186] to-[#2EC477] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-all shadow-lg"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#34D186]">B</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{ rideLoading === "bolt" ? "Opening..." : "Bolt" }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>

              <!-- Lineman -->
              <button
                @click="openRide('lineman')"
                :disabled="rideLoading === 'lineman'"
                aria-label="Open Lineman"
                class="w-full h-16 bg-gradient-to-r from-[#00B14F] to-[#009440] rounded-2xl flex items-center px-4 gap-3 active:scale-98 transition-all shadow-lg"
              >
                <div
                  class="w-10 h-10 bg-white rounded-full flex items-center justify-center"
                >
                  <span class="text-lg font-black text-[#00B14F]">L</span>
                </div>
                <span class="flex-1 text-left font-bold text-white text-lg">
                  {{ rideLoading === "lineman" ? "Opening..." : "Lineman" }}
                </span>
                <ChevronRight class="w-5 h-5 text-white/70" />
              </button>
            </div>

            <!-- Status Message -->
            <transition name="fade">
              <div
                v-if="copyStatus"
                class="text-center py-2 px-4 bg-green-100 dark:bg-green-900/30 rounded-xl"
              >
                <p class="text-sm font-bold text-green-600 dark:text-green-400">
                  {{ copyStatus }}
                </p>
              </div>
            </transition>

            <!-- Helper Text -->
            <p
              class="text-center text-xs text-gray-400 dark:text-gray-500 mt-4"
              v-if="isMobile"
            >
              If app doesn't open, please launch manually
            </p>
          </div>

          <!-- Safe Area Bottom -->
          <div class="h-[calc(var(--safe-area-bottom)+16px)]"></div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* iOS-Style Smooth Scrolling */
.overflow-y-auto {
  -webkit-overflow-scrolling: touch;
}

/* Hide Scrollbar */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

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

/* Active Scale */
.active\:scale-95:active {
  transform: scale(0.95);
}

.active\:scale-98:active {
  transform: scale(0.98);
}

/* Disable Button States */
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
