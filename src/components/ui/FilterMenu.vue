<!-- src/components/ui/FilterMenu.vue -->
<!--
  Redesigned Category Filter — VibeCity Entertainment Map
  Bottom-sheet layout with 2-column grid, staggered card entrance,
  ripple selection, gradient glow borders, swipe-down-to-dismiss.
  GPU-accelerated transforms only — no layout thrashing.
-->
<script setup>
import { Check, Sparkles, X } from "lucide-vue-next";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useBodyScrollLock } from "@/composables/useBodyScrollLock";
import { useHaptics } from "@/composables/useHaptics";
import {
	FILTER_CATEGORIES,
	isValidCategoryId,
} from "@/constants/filterCategories";

const props = defineProps({
	isOpen: Boolean,
	selectedCategories: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "apply"]);

// ==================== STATE ====================
const selected = ref([]);
const sheetRef = ref(null);
const listRef = ref(null);

const isDragging = ref(false);
const startY = ref(0);
const currentY = ref(0);
const lastMoveTime = ref(0);
const swipeVelocityY = ref(0);
const dirtySelection = ref(false);
const liveRegionText = ref("");
const isVisible = ref(false);
const rippleTarget = ref(null);
let liveAnnounceTimer = null;

// ==================== UTILS ====================
const { lock, unlock } = useBodyScrollLock();
const haptics = useHaptics?.();

const selectedSetRef = ref(new Set());
const selectedSet = computed(() => selectedSetRef.value);
const selectedCount = computed(() => selected.value.length);

const triggerLight = () =>
	haptics?.impactFeedback?.("light") ?? haptics?.light?.();
const triggerMedium = () =>
	haptics?.impactFeedback?.("medium") ?? haptics?.medium?.();

// ==================== SYNC FROM PROPS ====================
const sanitizeCategoryIds = (ids) =>
	Array.isArray(ids) ? ids.filter((id) => isValidCategoryId(id)) : [];

const syncFromProps = (val) => {
	selected.value = sanitizeCategoryIds(val);
	selectedSetRef.value = new Set(selected.value);
	dirtySelection.value = false;
};

watch(
	() => props.selectedCategories,
	(v) => {
		if (props.isOpen && dirtySelection.value) return;
		syncFromProps(v);
	},
	{ immediate: true },
);

// ==================== OPEN/CLOSE ====================
const resetSheetStyle = () => {
	const el = sheetRef.value;
	if (!el) return;
	el.style.transform = "";
	el.style.opacity = "";
};

const onKeydown = (e) => {
	if (!props.isOpen) return;
	if (e.defaultPrevented) return;
	if (
		sheetRef.value &&
		!sheetRef.value.contains(e.target) &&
		!sheetRef.value.contains(document.activeElement)
	) {
		return;
	}
	if (e.key === "Escape") {
		e.preventDefault();
		close();
	}
};

watch(
	() => props.isOpen,
	async (open) => {
		if (open) {
			syncFromProps(props.selectedCategories);
			lock();
			document.addEventListener("keydown", onKeydown);
			await nextTick();
			requestAnimationFrame(() => {
				isVisible.value = true;
			});
			sheetRef.value?.focus?.();
		} else {
			isVisible.value = false;
			unlock();
			document.removeEventListener("keydown", onKeydown);
			resetSheetStyle();
			isDragging.value = false;
		}
	},
	{ immediate: true },
);

// ==================== ACTIONS ====================
const close = () => {
	triggerLight();
	isVisible.value = false;
	setTimeout(() => emit("close"), 280);
};

const toggleCategory = (id, event) => {
	if (!isValidCategoryId(id)) return;

	// Ripple effect from click position
	if (event?.currentTarget) {
		const rect = event.currentTarget.getBoundingClientRect();
		const x =
			(event.clientX ||
				event.touches?.[0]?.clientX ||
				rect.left + rect.width / 2) - rect.left;
		const y =
			(event.clientY ||
				event.touches?.[0]?.clientY ||
				rect.top + rect.height / 2) - rect.top;
		rippleTarget.value = { id, x, y };
		setTimeout(() => {
			if (rippleTarget.value?.id === id) rippleTarget.value = null;
		}, 600);
	}

	const idx = selected.value.indexOf(id);
	if (idx === -1) selected.value.push(id);
	else selected.value.splice(idx, 1);
	selectedSetRef.value = new Set(selected.value);
	dirtySelection.value = true;
	triggerLight();
};

const applyFilters = () => {
	emit("apply", sanitizeCategoryIds(selected.value));
	dirtySelection.value = false;
	triggerMedium();
	isVisible.value = false;
	setTimeout(() => emit("close"), 280);
};

const clearAll = () => {
	if (selected.value.length === 0) return;
	selected.value = [];
	selectedSetRef.value = new Set();
	dirtySelection.value = false;
	emit("apply", []);
	triggerMedium();
};

// ==================== SWIPE DOWN TO CLOSE ====================
const SWIPE_ACTIVATE_PX = 10;
const SWIPE_CLOSE_PX = 100;
const VELOCITY_CLOSE = 0.5;

const onTouchStart = (e) => {
	if (e.touches.length !== 1) return;
	const t = e.touches[0];
	startY.value = t.clientY;
	currentY.value = t.clientY;
	isDragging.value = false;
	swipeVelocityY.value = 0;
	lastMoveTime.value = performance.now();
};

const onTouchMove = (e) => {
	if (!sheetRef.value || e.touches.length !== 1) return;
	const t = e.touches[0];
	const now = performance.now();
	const prevY = currentY.value;
	currentY.value = t.clientY;

	const dy = currentY.value - startY.value;
	const dt = Math.max(1, now - lastMoveTime.value);
	swipeVelocityY.value = (currentY.value - prevY) / dt;
	lastMoveTime.value = now;

	// Only drag down when list is at top
	const listScrollTop = listRef.value?.scrollTop || 0;
	if (listScrollTop > 2) return;
	if (dy < SWIPE_ACTIVATE_PX) return;

	isDragging.value = true;
	if (e.cancelable) e.preventDefault();

	const clamped = Math.min(dy, 300);
	const opacity = Math.max(0.4, 1 - clamped / 400);

	sheetRef.value.style.transform = `translateY(${clamped}px)`;
	sheetRef.value.style.opacity = `${opacity}`;
};

const onTouchEnd = () => {
	if (!sheetRef.value) return;

	const dy = currentY.value - startY.value;
	const fastEnough = swipeVelocityY.value > VELOCITY_CLOSE;

	if (isDragging.value && (dy > SWIPE_CLOSE_PX || fastEnough)) {
		triggerMedium();
		isVisible.value = false;
		setTimeout(() => {
			emit("close");
			resetSheetStyle();
		}, 280);
		isDragging.value = false;
		return;
	}

	// Snap back
	if (sheetRef.value) {
		sheetRef.value.style.transition =
			"transform 250ms ease, opacity 250ms ease";
		sheetRef.value.style.transform = "translateY(0)";
		sheetRef.value.style.opacity = "1";
		setTimeout(() => {
			if (sheetRef.value) sheetRef.value.style.transition = "";
		}, 260);
	}
	isDragging.value = false;
};

// ==================== LIFECYCLE ====================
watch(
	() => selectedCount.value,
	(count) => {
		if (liveAnnounceTimer) clearTimeout(liveAnnounceTimer);
		liveAnnounceTimer = setTimeout(() => {
			liveRegionText.value = count > 0 ? `${count} filters selected` : "";
			liveAnnounceTimer = null;
		}, 140);
	},
	{ immediate: true },
);

onUnmounted(() => {
	document.removeEventListener("keydown", onKeydown);
	if (liveAnnounceTimer) {
		clearTimeout(liveAnnounceTimer);
		liveAnnounceTimer = null;
	}
	unlock();
});
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-labelledby="filter-title"
    class="fm-overlay"
    :class="{ 'fm-overlay--visible': isVisible }"
  >
    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ liveRegionText }}
    </p>

    <!-- Backdrop -->
    <div
      class="fm-backdrop"
      :class="{
        'fm-backdrop--visible': isVisible,
        'pointer-events-none': isDragging,
      }"
      @click="close"
      @touchmove.prevent
      aria-hidden="true"
    />

    <!-- Bottom Sheet -->
    <div
      ref="sheetRef"
      tabindex="-1"
      data-testid="filter-menu"
      class="fm-sheet"
      :class="{ 'fm-sheet--visible': isVisible }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- Drag Handle -->
      <div class="fm-handle-wrap" aria-hidden="true">
        <div class="fm-handle" />
      </div>

      <!-- Header -->
      <div class="fm-header">
        <div class="fm-header__left">
          <Sparkles class="fm-header__icon" aria-hidden="true" />
          <h2 id="filter-title" class="fm-header__title">
            Filter Vibe
          </h2>
          <Transition name="fm-badge">
            <span
              v-if="selectedCount > 0"
              class="fm-badge"
              :aria-label="`${selectedCount} filters selected`"
            >
              {{ selectedCount }}
            </span>
          </Transition>
        </div>
        <button
          @click="close"
          aria-label="Close filter menu"
          class="fm-close"
        >
          <X class="fm-close__icon" aria-hidden="true" />
        </button>
      </div>

      <!-- Category Grid -->
      <div
        ref="listRef"
        class="fm-grid-scroll"
        role="group"
        aria-label="Filter categories"
      >
        <div class="fm-grid">
          <button
            v-for="(cat, index) in FILTER_CATEGORIES"
            :key="cat.id"
            @click="toggleCategory(cat.id, $event)"
            :aria-pressed="selectedSet.has(cat.id)"
            :aria-label="`${cat.label} filter, ${selectedSet.has(cat.id) ? 'selected' : 'not selected'}`"
            class="fm-card"
            :class="{
              'fm-card--active': selectedSet.has(cat.id),
              'fm-card--visible': isVisible,
            }"
            :style="{ '--card-delay': `${index * 50 + 80}ms` }"
          >
            <!-- Ripple -->
            <span
              v-if="rippleTarget?.id === cat.id"
              class="fm-ripple"
              :style="{
                left: `${rippleTarget.x}px`,
                top: `${rippleTarget.y}px`,
              }"
            />

            <!-- Gradient glow border when selected -->
            <span
              v-if="selectedSet.has(cat.id)"
              class="fm-card__glow"
              :class="`fm-glow--${cat.id.toLowerCase()}`"
            />

            <!-- Icon -->
            <div
              class="fm-card__icon-wrap"
              :class="
                selectedSet.has(cat.id)
                  ? `fm-icon-bg--${cat.id.toLowerCase()}`
                  : ''
              "
            >
              <component
                :is="cat.icon"
                class="fm-card__icon"
                :class="[
                  selectedSet.has(cat.id)
                    ? 'text-white fm-icon--pop'
                    : cat.iconColor,
                ]"
                aria-hidden="true"
              />
            </div>

            <!-- Label -->
            <span
              class="fm-card__label"
              :class="
                selectedSet.has(cat.id) ? 'text-white' : 'text-white/80'
              "
            >
              {{ cat.label }}
            </span>

            <!-- Check indicator -->
            <Transition name="fm-check">
              <div
                v-if="selectedSet.has(cat.id)"
                class="fm-card__check"
                aria-hidden="true"
              >
                <Check class="w-3.5 h-3.5 text-white" stroke-width="3" />
              </div>
            </Transition>
          </button>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="fm-footer">
        <Transition name="fm-fade-slide">
          <button
            v-if="selectedCount > 0"
            @click="clearAll"
            aria-label="Clear all filters"
            class="fm-btn-clear"
          >
            Clear ({{ selectedCount }})
          </button>
        </Transition>

        <button
          @click="applyFilters"
          aria-label="Apply selected filters"
          class="fm-btn-apply"
          :class="{ 'fm-btn-apply--has-selection': selectedCount > 0 }"
        >
          <span class="fm-btn-apply__text">
            {{ selectedCount > 0 ? "Show Results" : "Apply Filters" }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════
   OVERLAY
   ═══════════════════════════════════════ */
.fm-overlay {
  position: fixed;
  inset: 0;
  z-index: 5600;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}
.fm-overlay--visible {
  pointer-events: auto;
}

/* ═══════════════════════════════════════
   BACKDROP
   ═══════════════════════════════════════ */
.fm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
  opacity: 0;
  transition: opacity 300ms ease;
  will-change: opacity;
}
.fm-backdrop--visible {
  opacity: 1;
}

/* ═══════════════════════════════════════
   BOTTOM SHEET
   ═══════════════════════════════════════ */
.fm-sheet {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 15, 25, 0.92);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
  border-radius: 28px 28px 0 0;
  box-shadow:
    0 -8px 60px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 1px 0 rgba(255, 255, 255, 0.08) inset;
  overflow: hidden;
  outline: none;
  touch-action: pan-y;
  pointer-events: auto;

  transform: translateY(100%);
  opacity: 0;
  transition:
    transform 350ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 300ms ease;
  will-change: transform, opacity;
}
.fm-sheet--visible {
  transform: translateY(0);
  opacity: 1;
}

/* ═══════════════════════════════════════
   DRAG HANDLE
   ═══════════════════════════════════════ */
.fm-handle-wrap {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
  cursor: grab;
}
.fm-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
  transition: background 200ms ease;
}
.fm-handle-wrap:active .fm-handle {
  background: rgba(255, 255, 255, 0.45);
}

/* ═══════════════════════════════════════
   HEADER
   ═══════════════════════════════════════ */
.fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px 14px;
}
.fm-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.fm-header__icon {
  width: 20px;
  height: 20px;
  color: var(--vc-color-brand-primary, #00f0ff);
  animation: fm-sparkle-rotate 4s linear infinite;
}
@keyframes fm-sparkle-rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.fm-header__title {
  font-size: 1.1rem;
  font-weight: 900;
  color: white;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.fm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: linear-gradient(135deg, #00f0ff, #bc13fe);
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
}

.fm-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition:
    background 150ms ease,
    color 150ms ease,
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-tap-highlight-color: transparent;
}
.fm-close:hover {
  background: rgba(255, 255, 255, 0.14);
  color: white;
}
.fm-close:active {
  transform: scale(0.9);
}
.fm-close__icon {
  width: 18px;
  height: 18px;
}

/* ═══════════════════════════════════════
   CATEGORY GRID
   ═══════════════════════════════════════ */
.fm-grid-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 4px 16px 8px;
}
.fm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

/* ═══════════════════════════════════════
   CATEGORY CARD
   ═══════════════════════════════════════ */
.fm-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 12px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  min-height: 100px;
  min-width: 44px;

  /* Staggered entrance */
  opacity: 0;
  transform: translateY(24px) scale(0.92);
  transition:
    opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background 200ms ease,
    border-color 200ms ease,
    box-shadow 200ms ease;
  transition-delay: var(--card-delay, 0ms);
}
.fm-card--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.fm-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.fm-card:active {
  transform: scale(0.96) !important;
  transition-duration: 100ms;
}

.fm-card--active {
  background: rgba(255, 255, 255, 0.06);
  border-color: transparent;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

/* ═══════════════════════════════════════
   GRADIENT GLOW BORDER (selected)
   ═══════════════════════════════════════ */
.fm-card__glow {
  position: absolute;
  inset: -1px;
  border-radius: 21px;
  z-index: 0;
  opacity: 0.7;
  padding: 2px;
  animation: fm-glow-pulse 2s ease-in-out infinite;
  /* mask trick: show only the border ring */
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}
.fm-glow--recommended {
  background: linear-gradient(135deg, #34d399, #06b6d4);
}
.fm-glow--cafe {
  background: linear-gradient(135deg, #fb923c, #f59e0b);
}
.fm-glow--nightlife {
  background: linear-gradient(135deg, #a78bfa, #e879f9);
}
.fm-glow--restaurant {
  background: linear-gradient(135deg, #fb7185, #f43f5e);
}
.fm-glow--shopping {
  background: linear-gradient(135deg, #f472b6, #d946ef);
}
.fm-glow--events {
  background: linear-gradient(135deg, #fbbf24, #f97316);
}

@keyframes fm-glow-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* ═══════════════════════════════════════
   ICON
   ═══════════════════════════════════════ */
.fm-card__icon-wrap {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  transition:
    background 250ms ease,
    transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fm-icon-bg--recommended {
  background: linear-gradient(
    135deg,
    rgba(52, 211, 153, 0.3),
    rgba(6, 182, 212, 0.3)
  );
}
.fm-icon-bg--cafe {
  background: linear-gradient(
    135deg,
    rgba(251, 146, 60, 0.3),
    rgba(245, 158, 11, 0.3)
  );
}
.fm-icon-bg--nightlife {
  background: linear-gradient(
    135deg,
    rgba(167, 139, 250, 0.3),
    rgba(232, 121, 249, 0.3)
  );
}
.fm-icon-bg--restaurant {
  background: linear-gradient(
    135deg,
    rgba(251, 113, 133, 0.3),
    rgba(244, 63, 94, 0.3)
  );
}
.fm-icon-bg--shopping {
  background: linear-gradient(
    135deg,
    rgba(244, 114, 182, 0.3),
    rgba(217, 70, 239, 0.3)
  );
}
.fm-icon-bg--events {
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.3),
    rgba(249, 115, 22, 0.3)
  );
}

.fm-card__icon {
  width: 22px;
  height: 22px;
  transition:
    color 200ms ease,
    transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fm-icon--pop {
  animation: fm-icon-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes fm-icon-pop {
  0% {
    transform: scale(0.6) rotate(-15deg);
  }
  60% {
    transform: scale(1.25) rotate(5deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

/* ═══════════════════════════════════════
   LABEL
   ═══════════════════════════════════════ */
.fm-card__label {
  position: relative;
  z-index: 1;
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  line-height: 1.2;
  transition: color 200ms ease;
}

/* ═══════════════════════════════════════
   CHECK INDICATOR
   ═══════════════════════════════════════ */
.fm-card__check {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ═══════════════════════════════════════
   RIPPLE EFFECT
   ═══════════════════════════════════════ */
.fm-ripple {
  position: absolute;
  z-index: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  transform: translate(-50%, -50%) scale(0);
  animation: fm-ripple-expand 500ms ease-out forwards;
  pointer-events: none;
}
@keyframes fm-ripple-expand {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(20);
    opacity: 0;
  }
}

/* ═══════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════ */
.fm-footer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.3);
}

.fm-btn-clear {
  flex-shrink: 0;
  padding: 0 16px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  transition:
    background 150ms ease,
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-tap-highlight-color: transparent;
}
.fm-btn-clear:hover {
  background: rgba(255, 255, 255, 0.14);
}
.fm-btn-clear:active {
  transform: scale(0.96);
}

.fm-btn-apply {
  flex: 1;
  position: relative;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95),
    rgba(255, 255, 255, 0.85)
  );
  color: #0f0f19;
  border: none;
  cursor: pointer;
  overflow: hidden;
  min-width: 44px;
  min-height: 44px;
  transition:
    background 250ms ease,
    box-shadow 200ms ease,
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-tap-highlight-color: transparent;
}
.fm-btn-apply--has-selection {
  background: linear-gradient(135deg, #00f0ff, #bc13fe);
  color: white;
  box-shadow: 0 4px 20px rgba(0, 240, 255, 0.3);
}
.fm-btn-apply:hover {
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1);
}
.fm-btn-apply:active {
  transform: scale(0.97);
}
.fm-btn-apply__text {
  font-size: 0.9rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ═══════════════════════════════════════
   TRANSITIONS
   ═══════════════════════════════════════ */

/* Badge pop */
.fm-badge-enter-active {
  animation: fm-badge-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fm-badge-leave-active {
  animation: fm-badge-pop 0.2s ease reverse;
}
@keyframes fm-badge-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  70% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Check mark */
.fm-check-enter-active {
  animation: fm-check-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fm-check-leave-active {
  animation: fm-check-in 0.2s ease reverse;
}
@keyframes fm-check-in {
  0% {
    transform: scale(0) rotate(-90deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

/* Fade slide for clear button */
.fm-fade-slide-enter-active {
  transition:
    opacity 250ms ease,
    transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fm-fade-slide-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.fm-fade-slide-enter-from,
.fm-fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px) scale(0.95);
}

/* ═══════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════ */
@media (min-width: 640px) {
  .fm-sheet {
    max-width: 420px;
    border-radius: 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 24px;
    max-height: 75vh;
  }
  .fm-overlay {
    align-items: center;
  }
}

@media (max-width: 380px) {
  .fm-grid {
    gap: 8px;
  }
  .fm-card {
    padding: 16px 8px 12px;
    min-height: 88px;
  }
  .fm-card__icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: 12px;
  }
  .fm-card__label {
    font-size: 0.72rem;
  }
}

/* ═══════════════════════════════════════
   ACCESSIBILITY
   ═══════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .fm-sheet,
  .fm-backdrop,
  .fm-card,
  .fm-close,
  .fm-btn-clear,
  .fm-btn-apply {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
  .fm-card--visible {
    opacity: 1;
    transform: none;
  }
  .fm-sheet--visible {
    transform: none;
    opacity: 1;
  }
  .fm-header__icon,
  .fm-card__glow {
    animation: none !important;
  }
  .fm-card__glow {
    opacity: 0.8;
  }
}

button:focus-visible {
  outline: 3px solid rgba(0, 240, 255, 0.7);
  outline-offset: 2px;
}

@media (prefers-contrast: high) {
  .fm-sheet {
    background: rgba(0, 0, 0, 0.98);
    border-color: rgba(255, 255, 255, 0.5);
  }
  .fm-card {
    border-width: 2px;
  }
  .fm-card--active {
    border-color: white;
  }
}

/* Custom scrollbar */
.fm-grid-scroll::-webkit-scrollbar {
  width: 4px;
}
.fm-grid-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.fm-grid-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
