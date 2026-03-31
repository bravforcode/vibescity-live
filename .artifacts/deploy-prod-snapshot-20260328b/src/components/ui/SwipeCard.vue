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
} from "lucide-vue-next";
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onUnmounted,
	ref,
	watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useGranularAudio } from "@/composables/engine/useGranularAudio.js";
import { useHaptics } from "@/composables/useHaptics";
import { useHardwareInfo } from "@/composables/useHardwareInfo";
import { useVenueImage } from "@/composables/useVenueImage";
import { resolveVenueMedia } from "@/domain/venue/viewModel";
import { useFavoritesStore } from "../../store/favoritesStore";
import { useShopStore } from "../../store/shopStore";
import {
	getUsableMediaUrl,
	markMediaElementFailed,
} from "../../utils/mediaSourceGuard.js";

const ImageLoader = defineAsyncComponent(() => import("./ImageLoader.vue"));

const { t } = useI18n();

const props = defineProps({
	threshold: { type: Number, default: 100 },
	showExpand: { type: Boolean, default: true },
	isSelected: { type: Boolean, default: false },
	isImmersive: { type: Boolean, default: false },
	isActive: { type: Boolean, default: false },
	shop: { type: Object, default: null },
	fetchpriority: {
		type: String,
		default: "auto",
		validator: (v) => ["high", "low", "auto"].includes(v),
	},
});

const emit = defineEmits([
	"swipe-left",
	"swipe-right",
	"expand",
	"toggle-favorite",
	"share",
	"open-ride",
]);

const { selectFeedback, impactFeedback } = useHaptics();
const { onSwipe: audioSwipe, onSnap: audioSnap } = useGranularAudio();
const shopStore = useShopStore();
const favoritesStore = useFavoritesStore();

// Hardware context
const { isSlowNetwork, isLowPowerMode } = useHardwareInfo();

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
const displayTime = computed(() => {
	const o = props.shop?.openTime || props.shop?.OpenTime || "10:00";
	const c = props.shop?.closeTime || props.shop?.CloseTime || "22:00";
	return `${o} – ${c}`;
});
const resolvedVenueMedia = computed(() => resolveVenueMedia(props.shop || {}));
const mediaCounts = computed(
	() =>
		props.shop?.media_counts ||
		resolvedVenueMedia.value.counts || { images: 0, videos: 0, total: 0 },
);
const realImageCount = computed(() => Number(mediaCounts.value?.images || 0));
const realVideoCount = computed(() => Number(mediaCounts.value?.videos || 0));
const venueImage = computed(() =>
	useVenueImage({
		Image_URL1:
			resolvedVenueMedia.value.primaryImage ?? props.shop?.Image_URL1 ?? null,
		category: displayCategory.value,
	}),
);
const hasRealImage = computed(() => venueImage.value.hasRealImage);
const placeholderGradient = computed(
	() => venueImage.value.placeholderGradient,
);
const escapeCssUrl = (value) =>
	String(value || "")
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');

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

watch(
	() => favoritesStore.animatingFavoriteId,
	(id) => {
		if (id && props.shop?.id && String(id) === String(props.shop.id)) {
			// Trigger local burst animation when global signal fires for this shop
			showHeartAnim.value = false;
			nextTick(() => {
				showHeartAnim.value = true;
				setTimeout(() => {
					showHeartAnim.value = false;
				}, 600); // 600ms is enough for the burst
			});
		}
	},
);

const toggleFavorite = () => {
	if (!props.shop?.id) return;
	// Store handles the optimistic update, haptic pulse, and global animation signal
	const added = favoritesStore.toggleFavorite(props.shop.id);
	emit("toggle-favorite", { shopId: props.shop.id, isFavorite: added });
};

// ─────────────────────────────────────────────────────────────
// DOUBLE-TAP  (Pointer Events — works mouse + touch + stylus)
// ─────────────────────────────────────────────────────────────

const lastTapTime = ref(0);
const DOUBLE_TAP_MS = 280;
const activeTouchAction = ref("pan-x");
const INTERACTIVE_SELECTOR =
	"button, a, input, select, textarea, [role='button'], [data-interactive='true']";

const isInteractiveTarget = (target) =>
	target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));

const handlePointerUp = (e) => {
	// Only primary button / tap
	if (e.button !== 0 && e.button !== undefined) return;
	if (pointerStartedOnInteractive || isInteractiveTarget(e.target)) return;
	if (gestureActive && (gestureMoved || axisLocked)) return;
	if (isDragging.value) return;
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
const primaryImageUrl = computed(() => venueImage.value.imageUrl || "");
const resolvedVideoUrl = computed(() =>
	getUsableMediaUrl(resolvedVenueMedia.value.videoUrl || ""),
);
const canAutoPlayVideo = computed(
	() => !isSlowNetwork.value && !isLowPowerMode.value,
);
const showVideo = computed(
	() =>
		props.isActive &&
		Boolean(resolvedVideoUrl.value) &&
		canAutoPlayVideo.value &&
		!videoError.value,
);
const showImageFallback = computed(
	() =>
		Boolean(primaryImageUrl.value) && (!showVideo.value || !videoLoaded.value),
);
const showMediaPlaceholder = computed(
	() => !primaryImageUrl.value && (!showVideo.value || !videoLoaded.value),
);
const surfaceBackdropStyle = computed(() => {
	if (primaryImageUrl.value) {
		return {
			backgroundImage: `url("${escapeCssUrl(primaryImageUrl.value)}")`,
			backgroundPosition: "center",
			backgroundRepeat: "no-repeat",
			backgroundSize: "cover",
		};
	}
	return {
		background: placeholderGradient.value,
	};
});
const mediaPlaceholderStyle = computed(() => ({
	background: placeholderGradient.value,
}));

const handleVideoError = (event) => {
	if (Number(event?.target?.error?.code || 0) === 1) return;
	videoError.value = true;
	videoLoaded.value = false;
	markMediaElementFailed(event, resolvedVideoUrl.value);
	if (videoEl.value) {
		videoEl.value.pause();
		videoEl.value.removeAttribute("src");
		videoEl.value.load();
	}
};

watch(
	[() => props.shop?.id, resolvedVideoUrl],
	() => {
		videoLoaded.value = false;
		videoError.value = false;
		if (videoEl.value) {
			videoEl.value.pause();
			videoEl.value.muted = true;
		}
	},
	{ immediate: true },
);

watch(
	() => props.isActive,
	async (active) => {
		if (active) {
			if (props.shop?.id) shopStore.incrementView(props.shop.id);
			if (showVideo.value && videoEl.value && videoLoaded.value) {
				try {
					await videoEl.value.play();
				} catch {
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
let gestureMoved = false;
let pointerStartedOnInteractive = false;
let _lastMoveY = 0;
let _lastMoveT = 0;

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
	pointerStartedOnInteractive = isInteractiveTarget(e.target);
	if (pointerStartedOnInteractive) return;
	// Don't capture here — we track on the document in onPointerMove
	// to avoid losing tracking to child elements
	gestureActive = true;
	axisLocked = false;
	snapTriggered = false;
	gestureMoved = false;
	startX = e.clientX;
	startY = e.clientY;
	_lastMoveY = e.clientY;
	_lastMoveT = performance.now();
	isDragging.value = false; // only set true once axis locked vertical
	activeTouchAction.value = "pan-x";
	attachGlobal();
};

const onPointerMove = (e) => {
	if (!gestureActive) return;

	const dx = e.clientX - startX;
	const dy = e.clientY - startY; // negative = pulling up

	if (!axisLocked) {
		const totalMove = Math.sqrt(dx * dx + dy * dy);
		if (totalMove < 15) return; // dead-zone: wait for intent (increased from 6 to 15 to prevent accidental swipes)
		gestureMoved = true;
		axisLocked = Math.abs(dy) > Math.abs(dx) ? "vertical" : "horizontal";
	}

	if (axisLocked !== "vertical") {
		// Horizontal swipe — reset any pull and let parent handle
		if (pullY.value !== 0) pullY.value = 0;
		isDragging.value = false;
		activeTouchAction.value = "pan-x";
		return;
	}

	// Vertical — prevent page scroll
	e.preventDefault();
	isDragging.value = true;
	activeTouchAction.value = "none";

	if (dy < 0) {
		pullY.value = easePull(-dy); // positive value = pulled up

		// Velocity-driven audio feedback
		const _now = performance.now();
		const _dt = _now - _lastMoveT;
		if (_dt > 0) {
			audioSwipe(Math.abs(e.clientY - _lastMoveY) / _dt);
		}
		_lastMoveY = e.clientY;
		_lastMoveT = _now;

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
		activeTouchAction.value = "pan-x";
		pointerStartedOnInteractive = false;
		detachGlobal();
		return;
	}
	gestureActive = false;
	isDragging.value = false;
	activeTouchAction.value = "pan-x";

	if (pullY.value > props.threshold * 0.38) {
		impactFeedback("medium");
		audioSnap();
		emit("expand");
		requestAnimationFrame(() => {
			pullY.value = 0;
		});
	} else {
		pullY.value = 0;
	}
	gestureMoved = false;
	pointerStartedOnInteractive = false;
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
	"--radius": `${24 + progress.value * 8}px`,
	transform: `translate3d(0, calc(-1 * var(--pull)), 0) scale(var(--scale))`,
	borderRadius: "var(--radius)",
	transition: isDragging.value
		? "none"
		: "transform 0.55s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.35s ease",
	willChange: isDragging.value ? "transform, border-radius" : "auto",
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

const handleManualExpand = (event) => {
	const trigger =
		event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	trigger?.blur();
	impactFeedback("medium");
	audioSnap();
	emit("expand");
};

const handleRootKeydown = (e) => {
	if (e.target !== e.currentTarget) return;
	if (e.key !== "Enter" && e.key !== " ") return;
	e.preventDefault();
	handleManualExpand(e);
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
    :data-active="isActive ? 'true' : 'false'"
    :data-has-real-image="hasRealImage ? 'true' : 'false'"
    :data-card-visual="hasRealImage ? 'full-bleed' : 'placeholder'"
    :style="{ touchAction: activeTouchAction }"
    :tabindex="!isImmersive ? 0 : -1"
    :aria-label="!isImmersive ? `Open details for ${displayName}` : undefined"
    @pointerdown="onPointerDown"
    @pointerup="handlePointerUp"
    @keydown="handleRootKeydown"
  >
    <!-- ════════════════════════════════════════════
         CARD SURFACE
    ════════════════════════════════════════════ -->
    <div class="sc-surface" :style="[cardStyle, surfaceBackdropStyle]">
      <!-- ── Media Layer ─────────────────────────── -->
      <div class="sc-media">
        <video
          v-if="showVideo"
          ref="videoEl"
          :src="resolvedVideoUrl"
          :poster="primaryImageUrl || undefined"
          class="sc-media-fill transition-opacity duration-500"
          :class="videoLoaded ? 'opacity-100' : 'opacity-0'"
          muted
          loop
          playsinline
          preload="none"
          @loadeddata="videoLoaded = true"
          @error="handleVideoError"
        />
        <ImageLoader
          v-if="showImageFallback"
          :src="primaryImageUrl"
          :alt="displayName"
          :fetchpriority="fetchpriority"
          img-class="sc-media-fill transition-transform duration-700 will-change-transform group-hover:scale-105"
          :class="!videoLoaded ? 'z-10' : ''"
        />
        <!-- No media placeholder -->
        <div
          v-if="showMediaPlaceholder"
          class="sc-media-fill flex items-center justify-center"
          :style="mediaPlaceholderStyle"
        >
          <div class="flex flex-col items-center gap-3 text-white/70">
            <div
              class="w-14 h-14 rounded-full border border-white/20 bg-black/15 backdrop-blur-sm flex items-center justify-center"
            >
              <ImageOff class="w-6 h-6" />
            </div>
            <span class="text-[9px] uppercase tracking-widest font-bold"
              >{{ displayCategory }}</span
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
            class="w-[18px] h-[18px] transition-transform duration-200"
            :class="isFavorite ? 'fill-current scale-110' : 'scale-100'"
            aria-hidden="true"
          />
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
        <div class="sc-info-surface">
          <h4 class="sc-venue-name">{{ displayName }}</h4>

          <div class="sc-meta-row">
            <span class="sc-chip">{{ displayCategory }}</span>
            <span class="sc-meta-item sc-meta-item--distance">
              <MapPin class="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              {{ displayDistance }}
            </span>
            <span v-if="realImageCount > 0" class="sc-meta-item">
              IMG {{ realImageCount }}
            </span>
            <span v-if="realVideoCount > 0" class="sc-meta-item">
              VID {{ realVideoCount }}
            </span>
          </div>

          <div class="sc-sub-row">
            <div class="sc-stat-pill sc-stat-pill--time">
              <Clock class="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              <span>{{ displayTime }}</span>
            </div>
          </div>

          <div class="sc-cta-row">
            <button
              class="sc-cta sc-cta--secondary sc-cta--icon"
              :aria-label="t('common.share')"
              @click.stop="shareShop"
            >
              <Share2 class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span class="sr-only">{{ t("common.share") }}</span>
            </button>
            <button
              class="sc-cta sc-cta--primary"
              :aria-label="`${t('common.ride')} to ${displayName}`"
              @click.stop="emit('open-ride')"
            >
              <Car class="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{{ t("common.ride") }}</span>
              <span class="sc-cta-distance">{{ displayDistance }}</span>
            </button>
          </div>
        </div>
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
      :aria-hidden="pillOpacity < 0.15"
    >
      <button
        class="sc-pill pointer-events-auto"
        :tabindex="pillOpacity < 0.15 ? -1 : 0"
        :aria-label="t('shop.details')"
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
  container-type: inline-size;
  /* Limit paint/layout scope to this card — browser won't reflow neighbors */
  contain: layout style paint;

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
  cursor: pointer;
}

/* ─────────────────────────────────────────────────────────────
   SURFACE
───────────────────────────────────────────────────────────── */
.sc-surface {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(255 255 255 / 0.08), transparent 36%),
    linear-gradient(180deg, #0c1017 0%, #06080d 100%);
  border: 1px solid rgba(255 255 255 / 0.08);

  /* Shadow stack: ambient + directional + glow */
  box-shadow:
    0 8px 24px rgba(0 0 0 / 0.34),
    0 26px 60px rgba(0 0 0 / 0.52),
    0 0 0 0.5px rgba(255 255 255 / 0.06) inset;

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
  opacity: 0.16;
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
  background:
    linear-gradient(
      to top,
      rgba(2, 6, 12, 0.97) 0%,
      rgba(3, 10, 18, 0.82) 24%,
      rgba(7, 14, 22, 0.42) 54%,
      rgba(7, 10, 14, 0.12) 78%,
      transparent 100%
    ),
    linear-gradient(
      135deg,
      rgba(0, 0, 0, 0.38) 0%,
      rgba(0, 0, 0, 0.08) 38%,
      rgba(0, 0, 0, 0.44) 100%
    ),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.14), transparent 32%);
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
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.sc-badge--live {
  background: #b91c1c;
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
  background: rgba(7 10 16 / 0.58);
  border: 1px solid rgba(255 255 255 / 0.14);
  backdrop-filter: blur(14px) saturate(1.16);
  transition:
    background 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
}
.sc-action-btn:active {
  transform: scale(0.88);
}
.sc-action-btn:hover {
  background: rgba(15 23 42 / 0.72);
}
.sc-action-btn--active {
  background: #8f174b;
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
  padding: 0.55rem 0.65rem 0.75rem;
  z-index: 20;
  overflow: hidden;
}

.sc-info-surface {
  border-radius: 20px 20px 18px 18px;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  padding: 0.72rem 0.75rem 0.74rem;
}

.sc-venue-name {
  font-size: clamp(0.88rem, 0.72rem + 0.9cqi, 1.25rem);
  font-weight: 900;
  color: #fff;
  line-height: 1.12;
  letter-spacing: -0.02em;
  margin-bottom: 0.42rem;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* Keep long venue names readable on narrow cards. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-shadow:
    0 2px 10px rgba(0 0 0 / 0.78),
    0 0 18px rgba(0 0 0 / 0.46);
}

.sc-meta-row {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  flex-wrap: wrap;
  min-width: 0;
  margin-bottom: 0.42rem;
}

.sc-chip {
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 64%;
  padding: 0.32rem 0.55rem;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.16);
  border: 1px solid rgba(255 255 255 / 0.22);
  font-size: clamp(0.58rem, 0.5rem + 0.4cqi, 0.65rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255 255 255 / 0.98);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 6px rgba(0 0 0 / 0.55);
}

.sc-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: clamp(0.6rem, 0.55rem + 0.36cqi, 0.72rem);
  color: rgba(241 245 249 / 0.98);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 6px rgba(0 0 0 / 0.65);
}

.sc-meta-item--distance {
  margin-left: auto;
  flex: 0 1 auto;
  max-width: 44%;
  padding: 0.32rem 0.55rem;
  border-radius: 999px;
  background: rgba(8 145 178 / 0.24);
  border: 1px solid rgba(103 232 249 / 0.28);
  color: rgba(186 230 253 / 0.95);
}

.sc-sub-row {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  flex-wrap: nowrap;
  overflow: hidden;
  margin-bottom: 0.58rem;
}

.sc-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0.26rem 0.48rem;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.14);
  border: 1px solid rgba(255 255 255 / 0.18);
  color: rgba(255 255 255 / 0.96);
  flex-shrink: 0;
  text-shadow: 0 1px 6px rgba(0 0 0 / 0.65);
}
.sc-stat-pill--time {
  color: rgba(226 232 240 / 0.82);
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.sc-stat-pill--time span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-cta-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 0.55rem;
}

/* ─────────────────────────────────────────────────────────────
   CTA
───────────────────────────────────────────────────────────── */
.sc-cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0.72rem 0.8rem;
  border-radius: 14px;
  font-size: clamp(0.72rem, 0.62rem + 0.58cqi, 0.92rem);
  font-weight: 800;
  color: #fff;
  border: 1px solid transparent;
  box-shadow: 0 10px 22px rgba(2 6 23 / 0.26);
  transition:
    filter 0.18s ease,
    transform 0.14s ease;
}
.sc-cta--secondary {
  justify-content: flex-start;
  background: rgba(255 255 255 / 0.14);
  border-color: rgba(255 255 255 / 0.2);
  color: rgba(255 255 255 / 0.92);
}

.sc-cta--primary {
  justify-content: flex-start;
  background: linear-gradient(100deg, #0f4c81 0%, #0891b2 100%);
  border-color: rgba(103 232 249 / 0.22);
}

.sc-cta--icon {
  justify-content: center;
  padding-inline: 0;
}

.sc-cta-distance {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255 255 255 / 0.72);
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
  background: rgba(255 255 255 / 0.55);
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
  z-index: 30;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

[data-active="false"] .sc-info,
[data-active="false"] .sc-action-btn {
  pointer-events: none;
}

.sc-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 999px;
  background: #0b0f16;
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

@container (max-width: 13rem) {
  .sc-info {
    padding: 0.45rem 0.6rem 0.58rem;
  }

  .sc-info-surface {
    padding: 0.66rem;
  }

  .sc-meta-row,
  .sc-sub-row,
  .sc-cta-row {
    gap: 0.38rem;
  }

  .sc-cta {
    padding-inline: 0.72rem;
  }
}

@container (max-width: 10.5rem) {
  .sc-chip {
    max-width: 100%;
  }

  .sc-meta-item--distance {
    max-width: 100%;
    margin-left: 0;
  }

  .sc-stat-pill--time {
    display: none;
  }

  .sc-cta-distance {
    display: none;
  }
}
</style>
