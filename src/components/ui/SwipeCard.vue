<script setup>
/**
 * SwipeCard.vue — Enterprise Edition
 * Entertainment Map · Silky gestures · Zero jank · WCAG AA
 *
 * Architecture changes vs previous version:
 * - Pointer Events API replaces mixed touch/pointer handlers
 * - Axis-lock committed on first move (no mid-gesture flicker)
 * - All transforms via CSS custom properties → GPU composited only
 * - Pull-to-expand uses spring physics (no abrupt snaps)
 * - Zero layout-triggering properties during animation
 */

import {
	Car,
	ChevronUp,
	Clock,
	Flame,
	Heart,
	ImageOff,
	MapPin,
	Share2,
	Star,
	Volume2,
	VolumeX,
	Zap,
} from "lucide-vue-next";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useHaptics } from "@/composables/useHaptics";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useShopStore } from "../../store/shopStore";

const { t } = useI18n();

const props = defineProps({
	threshold: { type: Number, default: 100 },
	showExpand: { type: Boolean, default: true },
	isSelected: { type: Boolean, default: false },
	isImmersive: { type: Boolean, default: false },
	isActive: { type: Boolean, default: false },
	shop: { type: Object, default: null },
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

// ─────────────────────────────────────────────────────────────
// DERIVED DATA
// ─────────────────────────────────────────────────────────────

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
const displayDistance = computed(() => {
	const d = props.shop?.distance ?? props.shop?.Distance;
	return d == null ? "Nearby" : `${Number(d).toFixed(1)} km`;
});
const displayRating = computed(() => props.shop?.rating ?? "—");
const displayTime = computed(() => {
	const o = props.shop?.openTime || props.shop?.OpenTime || "10:00";
	const c = props.shop?.closeTime || props.shop?.CloseTime || "22:00";
	return `${o} – ${c}`;
});

const isGiantPin = computed(
	() =>
		String(props.shop?.pin_type || "").toLowerCase() === "giant" ||
		props.shop?.is_giant_active === true ||
		props.shop?.isGiantPin === true ||
		props.shop?.giantActive === true,
);
const isPromoted = computed(
	() =>
		props.shop?.isPromoted === true ||
		props.shop?.boostActive === true ||
		Number(props.shop?.visibilityScore || 0) > 0,
);
const isLive = computed(() => props.shop?.status === "LIVE");
const isFavorite = computed(() =>
	props.shop?.id ? favoritesStore.isFavorite(props.shop.id) : false,
);

// ─────────────────────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────────────────────

const showHeartAnim = ref(false);

const toggleFavorite = () => {
	if (!props.shop?.id) return;
	const added = favoritesStore.toggleFavorite(props.shop.id);
	successFeedback();
	if (added) {
		showHeartAnim.value = false;
		nextTick(() => {
			showHeartAnim.value = true;
			setTimeout(() => {
				showHeartAnim.value = false;
			}, 900);
		});
	}
	emit("toggle-favorite", { shopId: props.shop.id, isFavorite: added });
};

// ─────────────────────────────────────────────────────────────
// DOUBLE-TAP  (Pointer Events — works mouse + touch + stylus)
// ─────────────────────────────────────────────────────────────

const lastTapTime = ref(0);
const DOUBLE_TAP_MS = 280;

const handlePointerUp = (e) => {
	// Only primary button / tap
	if (e.button !== 0 && e.button !== undefined) return;
	const now = Date.now();
	if (now - lastTapTime.value < DOUBLE_TAP_MS) {
		toggleFavorite();
		lastTapTime.value = 0;
	} else {
		lastTapTime.value = now;
	}
};

// ─────────────────────────────────────────────────────────────
// SHARE
// ─────────────────────────────────────────────────────────────

const shareShop = async () => {
	selectFeedback();
	if (!props.shop) return;
	const url = `${window.location.origin}/venue/${props.shop.id}`;
	try {
		if (navigator.share) {
			await navigator.share({
				title: props.shop.name,
				text: `Check out ${props.shop.name}!`,
				url,
			});
		} else {
			await navigator.clipboard.writeText(url);
		}
		emit("share", { shop: props.shop, url });
	} catch {
		/* cancelled */
	}
};

// ─────────────────────────────────────────────────────────────
// VIDEO
// ─────────────────────────────────────────────────────────────

const videoEl = ref(null);
const videoLoaded = ref(false);
const videoError = ref(false);
const isMuted = ref(true);

const toggleMute = () => {
	if (!videoEl.value) return;
	isMuted.value = !isMuted.value;
	videoEl.value.muted = isMuted.value;
	selectFeedback();
};

watch(
	() => props.isActive,
	async (active) => {
		if (active) {
			if (props.shop?.id) shopStore.incrementView(props.shop.id);
			if (videoEl.value && videoLoaded.value) {
				try {
					await videoEl.value.play();
				} catch {
					isMuted.value = true;
					videoEl.value.muted = true;
					videoEl.value.play().catch(() => {});
				}
			}
		} else {
			videoEl.value?.pause();
		}
	},
	{ immediate: true },
);

onUnmounted(() => {
	if (videoEl.value) {
		videoEl.value.pause();
		videoEl.value.src = "";
		videoEl.value.load();
	}
});

// ─────────────────────────────────────────────────────────────
// GESTURE ENGINE
// Axis-lock on first move, spring physics, CSS custom props
// ─────────────────────────────────────────────────────────────

const container = ref(null);

// Raw gesture state (never triggers reactivity hot-path)
let gestureActive = false;
let axisLocked = false; // "vertical" | "horizontal" | false
let startX = 0;
let startY = 0;
let snapTriggered = false;

// Only these refs drive the template — kept minimal
const pullY = ref(0); // 0‥threshold  (pull-up distance, already eased)
const isDragging = ref(false);

// Spring easing: logarithmic resistance with a soft ceiling
const PULL_MAX = 180;
const easePull = (raw) => PULL_MAX * (1 - Math.exp(-Math.abs(raw) / 250));

// ── Pointer capture approach for bulletproof tracking ──

const onPointerDown = (e) => {
	if (props.isImmersive) return;
	if (e.button !== 0) return; // primary only
	// Don't capture here — we track on the document in onPointerMove
	// to avoid losing tracking to child elements
	gestureActive = true;
	axisLocked = false;
	snapTriggered = false;
	startX = e.clientX;
	startY = e.clientY;
	isDragging.value = false; // only set true once axis locked vertical
	attachGlobal();
};

const onPointerMove = (e) => {
	if (!gestureActive) return;

	const dx = e.clientX - startX;
	const dy = e.clientY - startY; // negative = pulling up

	if (!axisLocked) {
		const totalMove = Math.sqrt(dx * dx + dy * dy);
		if (totalMove < 15) return; // dead-zone: wait for intent (increased from 6 to 15 to prevent accidental swipes)
		axisLocked = Math.abs(dy) > Math.abs(dx) ? "vertical" : "horizontal";
	}

	if (axisLocked !== "vertical") {
		// Horizontal swipe — reset any pull and let parent handle
		if (pullY.value !== 0) pullY.value = 0;
		isDragging.value = false;
		return;
	}

	// Vertical — prevent page scroll
	e.preventDefault();
	isDragging.value = true;

	if (dy < 0) {
		pullY.value = easePull(-dy); // positive value = pulled up

		if (!snapTriggered && pullY.value > props.threshold * 0.75) {
			impactFeedback("light");
			snapTriggered = true;
		} else if (snapTriggered && pullY.value < props.threshold * 0.6) {
			snapTriggered = false;
		}
	} else {
		pullY.value = 0; // pulled down — ignore / resist
	}
};

const onPointerUp = () => {
	if (!gestureActive) {
		detachGlobal();
		return;
	}
	gestureActive = false;
	isDragging.value = false;

	if (pullY.value > props.threshold * 0.38) {
		impactFeedback("medium");
		emit("expand");
		requestAnimationFrame(() => {
			pullY.value = 0;
		});
	} else {
		pullY.value = 0;
	}
	detachGlobal();
};

// Attach move/up on window to keep tracking outside element bounds
// We attach lazily only while a gesture is in progress to stay efficient.
// Using passive: false on move so we can preventDefault on vertical.

let globalListenersAttached = false;

const attachGlobal = () => {
	if (globalListenersAttached) return;
	globalListenersAttached = true;
	window.addEventListener("pointermove", onPointerMove, { passive: false });
	window.addEventListener("pointerup", onPointerUp, { passive: true });
	window.addEventListener("pointercancel", onPointerUp, { passive: true });
};
const detachGlobal = () => {
	if (!globalListenersAttached) return;
	globalListenersAttached = false;
	window.removeEventListener("pointermove", onPointerMove);
	window.removeEventListener("pointerup", onPointerUp);
	window.removeEventListener("pointercancel", onPointerUp);
};

onUnmounted(detachGlobal);

// ─────────────────────────────────────────────────────────────
// TRANSFORMS  — GPU-only (transform + opacity)
// ─────────────────────────────────────────────────────────────

const progress = computed(() => Math.min(pullY.value / props.threshold, 1));

const cardStyle = computed(() => ({
	"--pull": `${pullY.value}px`,
	"--scale": `${1 - progress.value * 0.04}`,
	"--radius": `${32 + progress.value * 8}px`,
	transform: isDragging.value
		? `translate3d(0, calc(-1 * var(--pull)), 0) scale(var(--scale))`
		: `translate3d(0, calc(-1 * var(--pull)), 0) scale(var(--scale))`,
	borderRadius: "var(--radius)",
	transition: isDragging.value
		? "none"
		: "transform 0.55s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.35s ease",
	willChange: "transform, border-radius",
}));

const infoOpacity = computed(() =>
	Math.max(0, 1 - pullY.value / (props.threshold * 0.55)),
);
const handleOpacity = computed(() =>
	Math.max(0, 1 - pullY.value / (props.threshold * 0.4)),
);

// Release pill visibility (only show after meaningful pull)
const pillOpacity = computed(() =>
	pullY.value > 36
		? Math.min(1, (pullY.value - 36) / (props.threshold - 36))
		: 0,
);
const pillTransform = computed(
	() =>
		`translateY(${Math.min(0, -pullY.value * 0.12)}px) scale(${0.88 + progress.value * 0.14})`,
);

const handleManualExpand = () => {
	impactFeedback("medium");
	emit("expand");
};
</script>

<template>
  <!--
    Root: touch-action pan-x keeps horizontal swipe (parent carousel) working.
    pointer-events on root so hit area covers full card.
  -->
  <div
    ref="container"
    data-testid="shop-card"
    class="sc-root"
    :class="{ 'z-30': isSelected }"
    @pointerdown="onPointerDown"
    @pointerup="handlePointerUp"
  >
    <!-- ════════════════════════════════════════════
         CARD SURFACE
    ════════════════════════════════════════════ -->
    <div class="sc-surface" :style="cardStyle">
      <!-- ── Media Layer ─────────────────────────── -->
      <div class="sc-media">
        <video
          v-if="shop?.Video_URL || shop?.video_url"
          ref="videoEl"
          :src="shop?.Video_URL || shop?.video_url"
          :poster="shop.Image_URL1"
          class="sc-media-fill transition-opacity duration-500"
          :class="videoLoaded ? 'opacity-100' : 'opacity-0'"
          muted
          loop
          playsinline
          preload="none"
          @loadeddata="videoLoaded = true"
          @error="videoError = true"
        />
        <img
          v-if="
            !(shop?.Video_URL || shop?.video_url) || !videoLoaded || videoError
          "
          :src="shop?.Image_URL1"
          :alt="displayName"
          class="sc-media-fill object-cover transition-transform duration-700 will-change-transform group-hover:scale-105"
          :class="!videoLoaded ? 'z-10' : ''"
          loading="lazy"
          draggable="false"
        />
        <!-- No media placeholder -->
        <div
          v-if="!shop?.Image_URL1 && !(shop?.Video_URL || shop?.video_url)"
          class="sc-media-fill flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950"
        >
          <div class="flex flex-col items-center gap-3 text-zinc-600">
            <div
              class="w-14 h-14 rounded-full border border-zinc-800 flex items-center justify-center"
            >
              <ImageOff class="w-6 h-6" />
            </div>
            <span class="text-[9px] uppercase tracking-widest font-bold"
              >No Preview</span
            >
          </div>
        </div>
      </div>

      <!-- ── Cinematic Depth Glows ───────────────── -->
      <div class="sc-glows" aria-hidden="true">
        <div class="sc-glow sc-glow--pink" />
        <div class="sc-glow sc-glow--cyan" />
        <div class="sc-glow sc-glow--amber" />
      </div>

      <!-- ── Base Gradient ──────────────────────── -->
      <div class="sc-gradient" aria-hidden="true" />

      <!-- ── Volume Toggle ─────────────────────── -->
      <Transition name="fade">
        <button
          v-if="(shop?.Video_URL || shop?.video_url) && isActive"
          class="sc-action-btn absolute top-3 right-[3.75rem] z-30"
          :aria-label="isMuted ? t('a11y.unmute_video') : t('a11y.mute_video')"
          @click.stop="toggleMute"
        >
          <component
            :is="isMuted ? VolumeX : Volume2"
            class="w-[18px] h-[18px]"
          />
        </button>
      </Transition>

      <!-- ── Badges ────────────────────────────── -->
      <div
        class="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none"
      >
        <span
          v-if="isLive"
          class="sc-badge sc-badge--live"
          role="status"
          :aria-label="t('shop.live')"
        >
          <span class="sc-live-dot" aria-hidden="true" />{{ t("shop.live") }}
        </span>
        <span
          v-if="isPromoted"
          class="sc-badge sc-badge--promo"
          :aria-label="t('shop.promoted')"
        >
          <Flame class="w-3 h-3" aria-hidden="true" />{{ t("shop.promoted") }}
        </span>
        <span
          v-if="isGiantPin"
          class="sc-badge sc-badge--giant"
          :aria-label="t('shop.giant_pin')"
        >
          <Star class="w-3 h-3" aria-hidden="true" />{{ t("shop.giant_pin") }}
        </span>
      </div>

      <!-- ── Quick Actions ─────────────────────── -->
      <div
        v-if="!isImmersive"
        class="absolute top-3 right-3 z-20 flex flex-col gap-2"
      >
        <!-- Favorite -->
        <button
          class="sc-action-btn"
          :class="isFavorite && 'sc-action-btn--active'"
          :aria-label="
            isFavorite ? t('a11y.remove_favorite') : t('a11y.add_favorite')
          "
          :aria-pressed="isFavorite"
          @click.stop="toggleFavorite"
        >
          <Heart
            class="w-[18px] h-[18px] transition-all duration-200"
            :class="isFavorite ? 'fill-current scale-110' : 'scale-100'"
            aria-hidden="true"
          />
        </button>
        <!-- Share -->
        <button
          class="sc-action-btn"
          :aria-label="t('common.share')"
          @click.stop="shareShop"
        >
          <Share2 class="w-[18px] h-[18px]" />
        </button>
      </div>

      <!-- ── Heart Burst Animation ─────────────── -->
      <Transition name="heart">
        <div
          v-if="showHeartAnim"
          class="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
          aria-hidden="true"
        >
          <Heart class="sc-heart-burst text-rose-500 fill-current" />
        </div>
      </Transition>

      <!-- ── Info Panel ─────────────────────────── -->
      <div
        v-if="!isImmersive"
        class="sc-info"
        :style="{ opacity: infoOpacity, transition: 'opacity 0.15s ease' }"
      >
        <!-- Venue Name -->
        <h4 class="sc-venue-name">{{ displayName }}</h4>

        <!-- Meta row -->
        <div class="flex items-center gap-2 mb-3">
          <span class="sc-chip">{{ displayCategory }}</span>
          <span class="sc-meta-item">
            <Clock class="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {{ displayTime }}
          </span>
          <span class="sc-meta-item">
            <MapPin class="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {{ displayDistance }}
          </span>
        </div>

        <!-- Stats Row -->
        <div class="flex items-center gap-2 mb-4">
          <!-- Rating -->
          <div class="sc-stat-pill">
            <span class="sc-rating-dot" aria-hidden="true" />
            <span class="text-xs font-bold text-white tabular-nums">{{
              displayRating
            }}</span>
          </div>
          <!-- Open/Live indicator -->
          <div v-if="isLive" class="sc-stat-pill sc-stat-pill--live">
            <Zap class="w-3 h-3 text-red-400" aria-hidden="true" />
            <span class="text-[10px] font-bold text-red-400">Live Now</span>
          </div>
        </div>

        <!-- CTA -->
        <button
          class="sc-cta"
          :aria-label="`${t('common.ride')} to ${displayName}`"
          @click.stop="emit('open-ride')"
        >
          <Car class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{{ t("common.ride") }}</span>
          <span class="ml-auto text-[10px] font-normal opacity-60">{{
            displayDistance
          }}</span>
        </button>
      </div>
    </div>
    <!-- /sc-surface -->

    <!-- ════════════════════════════════════════════
         SLOT (injected overlays, e.g. map pins)
    ════════════════════════════════════════════ -->
    <slot />

    <!-- ── Drag Handle ───────────────────────────── -->
    <div
      v-if="showExpand"
      class="sc-handle-wrap"
      :style="{ opacity: handleOpacity }"
      aria-hidden="true"
    >
      <div class="sc-handle" />
    </div>

    <!-- ── Release Pill ──────────────────────────── -->
    <div
      class="sc-pill-wrap pointer-events-none"
      :style="{ opacity: pillOpacity, transform: pillTransform }"
      aria-hidden="true"
    >
      <button
        class="sc-pill pointer-events-auto"
        tabindex="-1"
        @click.stop="handleManualExpand"
      >
        <ChevronUp
          class="w-4 h-4 text-indigo-400 animate-bounce"
          stroke-width="2.5"
        />
        <span>{{ t("shop.details") }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ─────────────────────────────────────────────────────────────
   ROOT
───────────────────────────────────────────────────────────── */
.sc-root {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;

  /*
   * touch-action: pan-x  →  browser handles horizontal (parent carousel)
   * Our JS intercepts vertical via pointermove + preventDefault
   */
  touch-action: pan-x;
  overflow: visible;
  perspective: 1200px;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

/* ─────────────────────────────────────────────────────────────
   SURFACE
───────────────────────────────────────────────────────────── */
.sc-surface {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 32px;
  overflow: hidden;
  background: #0f0f12;
  border: 1px solid rgba(255 255 255 / 0.06);

  /* Shadow stack: ambient + directional + glow */
  box-shadow:
    0 4px 6px -1px rgba(0 0 0 / 0.5),
    0 20px 50px -12px rgba(0 0 0 / 0.7),
    0 0 0 0.5px rgba(255 255 255 / 0.04) inset;

  backface-visibility: hidden;
  transform: translateZ(0);
}

/* ─────────────────────────────────────────────────────────────
   MEDIA
───────────────────────────────────────────────────────────── */
.sc-media {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.sc-media-fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  will-change: transform;
}

/* ─────────────────────────────────────────────────────────────
   CINEMATIC GLOWS  — purely decorative, no layout impact
───────────────────────────────────────────────────────────── */
.sc-glows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  mix-blend-mode: overlay;
  opacity: 0.45;
}
.sc-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(60px);
}
.sc-glow--pink {
  width: 200px;
  height: 200px;
  top: -60px;
  left: -60px;
  background: #ec489966;
}
.sc-glow--cyan {
  width: 200px;
  height: 200px;
  bottom: -60px;
  right: -60px;
  background: #06b6d466;
}
.sc-glow--amber {
  width: 150px;
  height: 150px;
  top: 40%;
  left: 40%;
  background: #f59e0b33;
}

/* ─────────────────────────────────────────────────────────────
   GRADIENT OVERLAY
───────────────────────────────────────────────────────────── */
.sc-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.94) 0%,
    rgba(0, 0, 0, 0.35) 40%,
    transparent 80%
  );
  pointer-events: none;
  z-index: 10;
}

/* ─────────────────────────────────────────────────────────────
   BADGES
───────────────────────────────────────────────────────────── */
.sc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
}
.sc-badge--live {
  background: rgba(220 38 38 / 0.85);
  color: #fff;
  border: 1px solid rgba(248 113 113 / 0.4);
}
.sc-badge--promo {
  background: linear-gradient(90deg, #facc15, #d97706);
  color: #000;
  border: 1px solid rgba(253 224 71 / 0.5);
}
.sc-badge--giant {
  background: linear-gradient(90deg, #a855f7, #6366f1);
  color: #fff;
  border: 1px solid rgba(192 132 252 / 0.4);
}
.sc-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: pulse 1.4s ease-in-out infinite;
}

/* ─────────────────────────────────────────────────────────────
   ACTION BUTTONS
───────────────────────────────────────────────────────────── */
.sc-action-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0 0 0 / 0.45);
  backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255 255 255 / 0.1);
  transition:
    background 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
  /* GPU  */
  will-change: transform;
}
.sc-action-btn:active {
  transform: scale(0.88);
}
.sc-action-btn:hover {
  background: rgba(0 0 0 / 0.62);
}
.sc-action-btn--active {
  background: rgba(236 72 153 / 0.55);
  border-color: rgba(236 72 153 / 0.45);
  box-shadow: 0 0 18px rgba(236 72 153 / 0.35);
}
/* Focus visible ring (keyboard nav) */
.sc-action-btn:focus-visible {
  outline: 2px solid rgba(99 102 241 / 0.8);
  outline-offset: 2px;
}

/* ─────────────────────────────────────────────────────────────
   HEART BURST
───────────────────────────────────────────────────────────── */
.sc-heart-burst {
  width: 80px;
  height: 80px;
  filter: drop-shadow(0 0 20px rgba(236 72 153 / 0.8));
}
.heart-enter-active {
  animation: heartBeat 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.heart-leave-active {
  transition: opacity 0.25s ease;
}
.heart-leave-to {
  opacity: 0;
}

@keyframes heartBeat {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  55% {
    opacity: 1;
    transform: scale(1.15);
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* ─────────────────────────────────────────────────────────────
   INFO PANEL
───────────────────────────────────────────────────────────── */
.sc-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem 1rem 2.5rem;
  z-index: 20;
}

.sc-venue-name {
  font-size: 1.25rem;
  font-weight: 900;
  color: #fff;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin-bottom: 0.4rem;
  /* Multi-line truncate at 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 12px rgba(0 0 0 / 0.6);
}

.sc-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255 255 255 / 0.16);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255 255 255 / 0.08);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255 255 255 / 0.9);
  white-space: nowrap;
}

.sc-meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: rgba(255 255 255 / 0.65);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sc-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(0 0 0 / 0.45);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255 255 255 / 0.08);
}
.sc-stat-pill--live {
  border-color: rgba(239 68 68 / 0.3);
}

.sc-rating-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #facc15;
  flex-shrink: 0;
  box-shadow: 0 0 6px #facc15aa;
}

/* ─────────────────────────────────────────────────────────────
   CTA
───────────────────────────────────────────────────────────── */
.sc-cta {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border-radius: 14px;
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(100deg, #4f46e5 0%, #0ea5e9 100%);
  border: 1px solid rgba(129 140 248 / 0.25);
  box-shadow:
    0 4px 18px rgba(79 70 229 / 0.35),
    0 1px 0 rgba(255 255 255 / 0.08) inset;
  transition:
    filter 0.18s ease,
    transform 0.14s ease;
  will-change: transform;
}
.sc-cta:active {
  transform: scale(0.97);
  filter: brightness(0.92);
}
.sc-cta:hover {
  filter: brightness(1.1);
}
.sc-cta:focus-visible {
  outline: 2px solid rgba(99 102 241 / 0.8);
  outline-offset: 2px;
}

/* ─────────────────────────────────────────────────────────────
   DRAG HANDLE
───────────────────────────────────────────────────────────── */
.sc-handle-wrap {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
  transition: opacity 0.2s ease;
}
.sc-handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.35);
  backdrop-filter: blur(4px);
}

/* ─────────────────────────────────────────────────────────────
   RELEASE PILL
───────────────────────────────────────────────────────────── */
.sc-pill-wrap {
  position: absolute;
  bottom: 68px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 0;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.sc-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(0 0 0 / 0.65);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255 255 255 / 0.1);
  box-shadow: 0 8px 32px rgba(0 0 0 / 0.4);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255 255 255 / 0.88);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.sc-pill:active {
  transform: scale(0.96);
}

/* ─────────────────────────────────────────────────────────────
   MISC TRANSITIONS
───────────────────────────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ─────────────────────────────────────────────────────────────
   REDUCED MOTION — preserve functionality, drop eye-candy
───────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .sc-surface,
  .sc-cta,
  .sc-action-btn,
  .sc-media-fill {
    transition: none !important;
    animation: none !important;
  }
  .heart-enter-active {
    animation: none;
    opacity: 0;
  }
  .animate-bounce,
  .sc-live-dot {
    animation: none;
  }
}

/* ─────────────────────────────────────────────────────────────
   PULSE KEYFRAME (shared)
───────────────────────────────────────────────────────────── */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
