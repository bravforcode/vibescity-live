<script setup>
import {
	ChevronRight,
	MapPin,
	Navigation,
	Phone,
	Play,
	Sparkles,
	Store,
	Users,
	X,
} from "lucide-vue-next";
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onMounted,
	ref,
	watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useDialogA11y } from "../../composables/useDialogA11y";
import {
	getUsableMediaUrl,
	markMediaElementFailed,
	markMediaUrlFailed,
} from "../../utils/mediaSourceGuard.js";

const VisitorCount = defineAsyncComponent(
	() => import("../ui/VisitorCount.vue"),
);

const props = defineProps({
	activeGiantPin: {
		type: Object,
		required: true,
	},
	giantPinShops: {
		type: Array,
		default: () => [],
	},
	selectedGiantShop: {
		type: Object,
		default: null,
	},
	selectedGiantVideoUrl: {
		type: String,
		default: "",
	},
	selectedGiantImage: {
		type: String,
		default: "",
	},
	getShopPreviewImage: {
		type: Function,
		default: null,
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	isOpen: {
		type: Boolean,
		default: false,
	},
	isFetching: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["exit", "select-shop", "open-ride"]);
const { t } = useI18n();

const dialogRef = ref(null);
const dialogBodyRef = ref(null);
const closeButtonRef = ref(null);
const videoRef = ref(null);
const selectedImageBroken = ref(false);
const selectedVideoBroken = ref(false);
const isAnimatingIn = ref(false);
const isAnimatingOut = ref(false);
const activeTab = ref("info"); // 'info' | 'shops'

const selectedTitle = computed(() => props.activeGiantPin?.name || "Venue");
const resolvedSelectedImage = computed(() =>
	selectedImageBroken.value ? "" : getUsableMediaUrl(props.selectedGiantImage),
);
const resolvedSelectedVideoUrl = computed(() =>
	selectedVideoBroken.value
		? ""
		: getUsableMediaUrl(props.selectedGiantVideoUrl),
);

onMounted(async () => {
	if (!props.isOpen || !dialogRef.value || dialogRef.value.open) return;
	dialogRef.value.showModal();
	await nextTick();
	triggerEnterAnimation();
	closeButtonRef.value?.focus?.();
});

const triggerEnterAnimation = () => {
	isAnimatingIn.value = true;
	setTimeout(() => {
		isAnimatingIn.value = false;
	}, 600);
};

const closeDialog = async () => {
	isAnimatingOut.value = true;
	await new Promise((r) => setTimeout(r, 350));
	isAnimatingOut.value = false;
	const dialogEl = dialogRef.value;
	if (dialogEl?.open) {
		dialogEl.close();
		return;
	}
	emit("exit");
};

const handleNativeClose = () => {
	emit("exit");
};

const handleImageError = () => {
	selectedImageBroken.value = true;
	markMediaUrlFailed(props.selectedGiantImage);
};

const handleVideoError = (event) => {
	if (Number(event?.target?.error?.code || 0) === 1) return;
	selectedVideoBroken.value = true;
	markMediaElementFailed(event, props.selectedGiantVideoUrl);
};

const handleListImageError = (event) => {
	event.target.style.display = "none";
};

watch(
	() => [props.selectedGiantImage, props.selectedGiantVideoUrl],
	() => {
		selectedImageBroken.value = false;
		selectedVideoBroken.value = false;
	},
	{ immediate: true },
);

watch(
	() => props.isOpen,
	async (open) => {
		const dialogEl = dialogRef.value;
		if (!dialogEl) return;
		if (open) {
			if (!dialogEl.open) dialogEl.showModal();
			await nextTick();
			triggerEnterAnimation();
			closeButtonRef.value?.focus?.();
			return;
		}
		if (dialogEl.open) dialogEl.close();
	},
	{ immediate: true },
);

watch(
	() => resolvedSelectedVideoUrl.value,
	async (videoUrl) => {
		if (!videoUrl) return;
		await nextTick();
		videoRef.value?.play?.().catch(() => {});
	},
	{ immediate: true },
);

useDialogA11y({
	isOpen: () => props.isOpen,
	containerRef: dialogBodyRef,
	initialFocusRef: closeButtonRef,
	onClose: closeDialog,
	lockScroll: true,
});
</script>

<template>
  <dialog
    ref="dialogRef"
    class="giant-pin-modal"
    :class="{ 'animate-in': isAnimatingIn, 'animate-out': isAnimatingOut }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="giant-pin-title"
    @close="handleNativeClose"
    @cancel.prevent="closeDialog"
  >
    <div ref="dialogBodyRef" class="modal-shell">

      <!-- ═══════════════════════════════════════════
           LEFT PANEL — 70% — Video / Media
      ══════════════════════════════════════════════ -->
      <section class="media-panel">
        <!-- Floating close button -->
        <button
          ref="closeButtonRef"
          type="button"
          class="close-btn"
          :aria-label="t('common.close')"
          @click="closeDialog"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Media: video or image -->
        <div class="media-stage">
          <video
            v-if="resolvedSelectedVideoUrl"
            ref="videoRef"
            :src="resolvedSelectedVideoUrl"
            :poster="resolvedSelectedImage || undefined"
            muted
            loop
            playsinline
            class="media-asset"
            preload="metadata"
            @error="handleVideoError"
          >
            <track kind="captions" />
          </video>
          <img
            v-else-if="resolvedSelectedImage"
            :src="resolvedSelectedImage"
            :alt="selectedGiantShop?.name || selectedTitle"
            class="media-asset ken-burns"
            @error="handleImageError"
          />
          <div v-else class="media-placeholder">
            <Store class="w-16 h-16 text-white/15" />
          </div>

          <!-- Gradient overlays -->
          <div class="media-gradient-bottom"></div>
          <div class="media-gradient-right"></div>

          <!-- Title overlay on media -->
          <div class="media-title-bar">
            <div class="media-kicker">
              <Play class="w-3.5 h-3.5 fill-current" />
              <span>{{ t("shop.giant_pin") }}</span>
            </div>
            <div class="venue-chip">
              <MapPin class="w-3 h-3" />
              <span>{{ selectedTitle }}</span>
            </div>
            <h2 id="giant-pin-title" class="media-shop-name">
              {{ selectedGiantShop?.name || selectedTitle }}
            </h2>
            <p class="media-shop-category">
              {{ selectedGiantShop?.category || t("giant_pin.venue") }}
            </p>
          </div>
        </div>
      </section>

      <!-- ═══════════════════════════════════════════
           RIGHT PANEL — 30% — Info + Shop List
      ══════════════════════════════════════════════ -->
      <aside class="info-panel">

        <!-- Venue header -->
        <div class="panel-header">
          <div class="panel-header-text">
            <p class="panel-kicker">
              <Play class="w-3.5 h-3.5 fill-current" />
              <span>{{ selectedGiantShop?.name || selectedTitle }}</span>
            </p>
            <p class="shops-count">
              <Sparkles class="w-3 h-3 inline mr-1 text-rose-400" />
              {{ t("giant_pin.shops_inside", { count: giantPinShops.length }) }}
            </p>
          </div>
        </div>

        <!-- Scrollable body -->
        <div class="panel-body" :class="{ 'fetching': isFetching }">

          <!-- ── Shop detail section (when a shop is selected) ── -->
          <div v-if="selectedGiantShop" class="shop-detail-section">

            <!-- Action buttons -->
            <div class="action-row">
              <button
                type="button"
                class="action-btn action-btn--primary"
                @click="emit('open-ride', selectedGiantShop)"
              >
                <Navigation class="w-4 h-4" />
                <span>{{ t("common.directions") }}</span>
              </button>

              <a
                v-if="selectedGiantShop?.phone"
                :href="`tel:${selectedGiantShop.phone}`"
                class="action-btn action-btn--green"
              >
                <Phone class="w-4 h-4" />
                <span>{{ t("common.call") }}</span>
              </a>
              <button
                v-else
                type="button"
                disabled
                class="action-btn action-btn--disabled"
              >
                <Phone class="w-4 h-4" />
                <span>{{ t("giant_pin.no_phone") }}</span>
              </button>
            </div>

            <!-- Vibe / visitor count -->
            <div class="vibe-card">
              <div class="vibe-label">
                <Users class="w-3 h-3 text-rose-400" />
                <span>{{ t("giant_pin.current_vibe") }}</span>
              </div>
              <Suspense>
                <VisitorCount :shopId="selectedGiantShop.id" :isDarkMode="true" />
                <template #fallback>
                  <div class="vibe-skeleton">
                    <div class="skel-circle"></div>
                    <div class="skel-bar"></div>
                  </div>
                </template>
              </Suspense>
            </div>

            <!-- About -->
            <div class="about-card">
              <h4 class="card-label">{{ t("giant_pin.about") }}</h4>
              <p class="about-text">
                {{
                  selectedGiantShop?.description ||
                  t("giant_pin.default_about", { place: selectedTitle })
                }}
              </p>
            </div>
          </div>

          <!-- ── Divider ── -->
          <div class="shops-divider">
            <span>{{ t("giant_pin.shops_in_building") }}</span>
          </div>

          <!-- ── Shop list ── -->
          <div class="shop-list" aria-live="polite">

            <!-- Skeleton loader -->
            <template v-if="isFetching">
              <div v-for="i in 4" :key="`sk-${i}`" class="shop-card-skeleton"></div>
            </template>

            <!-- Shop cards -->
            <template v-else>
              <button
                v-for="shop in giantPinShops"
                :key="shop.id"
                type="button"
                class="shop-card"
                :class="{ 'shop-card--active': selectedGiantShop?.id === shop.id }"
                :aria-label="`${t('giant_pin.select')} ${shop.name}`"
                @click="emit('select-shop', shop)"
              >
                <!-- Thumbnail -->
                <div class="shop-thumb">
                  <img
                    v-if="getShopPreviewImage && getShopPreviewImage(shop)"
                    :src="getShopPreviewImage(shop)"
                    :alt="shop.name"
                    loading="lazy"
                    class="shop-thumb-img"
                    @error="handleListImageError"
                  />
                  <div v-else class="shop-thumb-fallback">
                    <Store class="w-5 h-5 text-white/20" />
                  </div>
                </div>

                <!-- Info -->
                <div class="shop-card-info">
                  <p class="shop-card-name">{{ shop.name }}</p>
                  <p class="shop-card-cat">{{ shop.category || t("giant_pin.shop") }}</p>
                </div>

                <ChevronRight class="shop-card-arrow" />
              </button>

              <!-- Empty state -->
              <div v-if="giantPinShops.length === 0" class="shops-empty">
                <Store class="w-8 h-8 opacity-20 mb-2" />
                <span>{{ t("giant_pin.no_shops") }}</span>
              </div>
            </template>
          </div>
        </div>
      </aside>
    </div>
  </dialog>
</template>

<style scoped>
/* ══════════════════════════════════════════════════════════
   TOKENS
══════════════════════════════════════════════════════════ */
:root {
  --modal-radius: 20px;
  --panel-bg: #0f0f0f;
  --surface: rgba(255,255,255,0.07);
  --border: rgba(255,255,255,0.1);
  --text-primary: #f0f0f5;
  --text-muted: rgba(255,255,255,0.5);
  --accent: #ff0033;
  --accent-glow: rgba(255,0,51,0.32);
}

/* ══════════════════════════════════════════════════════════
   BACKDROP
══════════════════════════════════════════════════════════ */
.giant-pin-modal::backdrop {
  background: rgba(0,0,0,0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: backdropIn 0.4s ease forwards;
}

@keyframes backdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ══════════════════════════════════════════════════════════
   MODAL BASE
══════════════════════════════════════════════════════════ */
.giant-pin-modal {
  background: transparent;
  border: none;
  padding: 0;
  margin: auto;
  width: min(96vw, 1100px);
  height: min(90vh, 680px);
  border-radius: var(--modal-radius);
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.07),
    0 30px 80px -10px rgba(0,0,0,0.7),
    0 0 60px -24px var(--accent-glow);
  transform-origin: center center;
  animation: modalIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;
}

/* Mobile: take more screen */
@media (max-width: 768px) {
  .giant-pin-modal {
    width: 100vw;
    height: 100svh;
    border-radius: var(--modal-radius) var(--modal-radius) 0 0;
    margin-top: auto;
    margin-bottom: 0;
    animation: modalInMobile 0.4s cubic-bezier(0.34,1.15,0.64,1) forwards;
  }
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.93) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes modalInMobile {
  from { opacity: 0; transform: translateY(60px); }
  to   { opacity: 1; transform: translateY(0); }
}

.giant-pin-modal.animate-out {
  animation: modalOut 0.35s cubic-bezier(0.36,0,0.66,0) forwards !important;
}

@keyframes modalOut {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to   { opacity: 0; transform: scale(0.95) translateY(8px); }
}

/* ══════════════════════════════════════════════════════════
   LAYOUT SHELL — 70/30
══════════════════════════════════════════════════════════ */
.modal-shell {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 7fr 3fr;
  background: #0f0f0f;
  border-radius: var(--modal-radius);
  overflow: hidden;
}

/* Mobile: stack vertically — video 45%, info 55% */
@media (max-width: 768px) {
  .modal-shell {
    grid-template-columns: 1fr;
    grid-template-rows: 45svh 1fr;
    border-radius: var(--modal-radius) var(--modal-radius) 0 0;
  }
}

/* ══════════════════════════════════════════════════════════
   LEFT — MEDIA PANEL (70%)
══════════════════════════════════════════════════════════ */
.media-panel {
  position: relative;
  overflow: hidden;
  background: #000;
}

.media-stage {
  position: absolute;
  inset: 0;
}

.media-asset {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Ken Burns slow pan */
@media (prefers-reduced-motion: no-preference) {
  .ken-burns {
    animation: kenBurns 16s ease-in-out infinite alternate;
  }
}
@keyframes kenBurns {
  0%   { transform: scale(1)    translate(0, 0); }
  100% { transform: scale(1.08) translate(-2%, -1.5%); }
}

.media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #0e0e12 100%);
}

/* Gradient overlay — bottom */
.media-gradient-bottom {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 50%;
  background: linear-gradient(to top, rgba(14,14,18,1) 0%, rgba(14,14,18,0.6) 50%, transparent 100%);
  pointer-events: none;
}

/* Gradient overlay — right edge fade into info panel */
.media-gradient-right {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 80px;
  background: linear-gradient(to right, transparent, rgba(15,15,15,0.96));
  pointer-events: none;
}

@media (max-width: 768px) {
  .media-gradient-right { display: none; }
  .media-gradient-bottom {
    height: 65%;
  }
}

/* Title overlay */
.media-title-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1.5rem 1.5rem 1.25rem;
  animation: slideUpFade 0.5s 0.2s ease both;
}

.media-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 0, 51, 0.92);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 10px 22px rgba(255, 0, 51, 0.28);
  margin-bottom: 10px;
}

@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.venue-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15,15,15,0.78);
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.88);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
  backdrop-filter: blur(10px);
}

.media-shop-name {
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-weight: 900;
  color: #fff;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 16px rgba(0,0,0,0.6);
  margin-bottom: 4px;
}

.media-shop-category {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.72);
  letter-spacing: 0.02em;
}

/* Close button — floating top-left of media */
.close-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(15,15,15,0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.12);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}
.close-btn:hover  { background: rgba(255,255,255,0.15); }
.close-btn:active { transform: scale(0.92); }

/* ══════════════════════════════════════════════════════════
   RIGHT — INFO PANEL (30%)
══════════════════════════════════════════════════════════ */
.info-panel {
  display: flex;
  flex-direction: column;
  background: #121212;
  border-left: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
}

.panel-header {
  padding: 18px 16px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(24,24,24,0.98) 0%, rgba(18,18,18,0.98) 100%);
}

.panel-header-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 0, 51, 0.14);
  border: 1px solid rgba(255, 0, 51, 0.28);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.panel-kicker span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shops-count {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.58);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0;
}

/* Scrollbar styling */
.panel-body::-webkit-scrollbar       { width: 3px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }
.panel-body::-webkit-scrollbar-thumb { background: rgba(255,0,51,0.28); border-radius: 99px; }

/* ── Shop detail ── */
.shop-detail-section {
  padding: 14px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeSlideIn 0.4s ease both;
}

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Action buttons */
.action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  border: 1px solid transparent;
  text-decoration: none;
  justify-content: center;
}

.action-btn:active { transform: scale(0.95); }

.action-btn--primary {
  background: linear-gradient(135deg, #ff0033, #ff3b30);
  color: #fff;
  box-shadow: 0 8px 24px rgba(255,0,51,0.3);
}
.action-btn--primary:hover { opacity: 0.9; }

.action-btn--green {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.08);
  color: #fff;
  box-shadow: none;
}
.action-btn--green:hover { opacity: 0.9; }

.action-btn--disabled {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.25);
  cursor: not-allowed;
}

/* Vibe card */
.vibe-card {
  background: linear-gradient(180deg, rgba(28,28,28,0.98) 0%, rgba(20,20,20,0.98) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 12px 14px;
}

.vibe-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.46);
  margin-bottom: 8px;
}

.vibe-skeleton {
  display: flex;
  align-items: center;
  gap: 10px;
}

.skel-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.07);
  animation: pulse 1.4s ease infinite;
  flex-shrink: 0;
}

.skel-bar {
  height: 14px;
  width: 80px;
  border-radius: 6px;
  background: rgba(255,255,255,0.07);
  animation: pulse 1.4s ease infinite 0.2s;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 1; }
}

/* About card */
.about-card {
  background: linear-gradient(180deg, rgba(28,28,28,0.98) 0%, rgba(20,20,20,0.98) 100%);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  padding: 12px 14px;
}

.card-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.42);
  margin-bottom: 8px;
}

.about-text {
  font-size: 12.5px;
  color: rgba(255,255,255,0.75);
  line-height: 1.6;
  word-break: break-word;
}

/* ── Shops divider ── */
.shops-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 10px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.42);
}

.shops-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(255,0,51,0.35), rgba(255,255,255,0.04));
}

/* ── Shop list ── */
.shop-list {
  padding: 0 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Skeleton cards */
.shop-card-skeleton {
  height: 68px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  animation: pulse 1.4s ease infinite;
}

/* Shop card */
.shop-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(24,24,24,0.9);
  text-align: left;
  width: 100%;
}

.shop-card:hover {
  background: rgba(34,34,34,0.98);
}

.shop-card:active {
  transform: scale(0.98);
}

.shop-card--active {
  background: rgba(42,18,24,0.98) !important;
  border-color: rgba(255,0,51,0.34) !important;
  box-shadow: 0 0 24px rgba(255,0,51,0.14);
}

/* Thumbnail */
.shop-thumb {
  width: 96px;
  height: 54px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255,255,255,0.05);
}

.shop-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.shop-card:hover .shop-thumb-img {
  transform: scale(1.08);
}

.shop-thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Card text */
.shop-card-info {
  flex: 1;
  min-width: 0;
}

.shop-card-name {
  font-size: 13.5px;
  font-weight: 800;
  color: #f0f0f5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.shop-card-cat {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.56);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-card-arrow {
  width: 14px;
  height: 14px;
  color: rgba(255,255,255,0.2);
  flex-shrink: 0;
  transition: color 0.2s, transform 0.2s;
}

.shop-card:hover .shop-card-arrow,
.shop-card--active .shop-card-arrow {
  color: #ff4f67;
  transform: translateX(2px);
}

/* Empty state */
.shops-empty {
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}

/* ══════════════════════════════════════════════════════════
   MOBILE OVERRIDES
══════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .info-panel {
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .media-title-bar {
    padding: 1rem 1rem 0.875rem;
  }

  .media-shop-name {
    font-size: 1.3rem;
  }

  .panel-body {
    /* Ensure bottom content is accessible above home indicator */
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .action-row {
    grid-template-columns: 1fr 1fr;
  }

  .shop-thumb {
    width: 84px;
    height: 48px;
  }

  .shop-card-skeleton {
    height: 60px;
  }
}
</style>
