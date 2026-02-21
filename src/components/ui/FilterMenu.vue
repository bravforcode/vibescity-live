<!-- src/components/map/FilterMenu.vue -->
<script setup>
import { Check, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useBodyScrollLock } from "@/composables/useBodyScrollLock";
// ✅ ใช้ระบบ haptics เดิมของโปรเจกต์คุณ (ถ้า path ไม่ตรง เปลี่ยนให้ตรงของจริง)
import { useHaptics } from "@/composables/useHaptics";
import {
	FILTER_CATEGORIES,
	validateCategoryIds,
} from "@/constants/filterCategories";

const props = defineProps({
	isOpen: Boolean,
	selectedCategories: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "apply"]);

// ==================== STATE ====================
const selected = ref([]);
const menuRef = ref(null);
const listRef = ref(null);

const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);
const currentX = ref(0);
const currentY = ref(0);
const listScrollStart = ref(0);

// ==================== UTILS ====================
const { lock, unlock } = useBodyScrollLock();
const haptics = useHaptics?.();

const selectedSet = computed(() => new Set(selected.value));
const selectedCount = computed(() => selected.value.length);

const triggerLight = () =>
	haptics?.impactFeedback?.("light") ?? haptics?.light?.();
const triggerMedium = () =>
	haptics?.impactFeedback?.("medium") ?? haptics?.medium?.();

// ==================== SYNC FROM PROPS ====================
const syncFromProps = (val) => {
	if (validateCategoryIds(val)) selected.value = [...val];
	else selected.value = [];
};

watch(
	() => props.selectedCategories,
	(v) => syncFromProps(v),
	{ immediate: true, deep: true },
);

// ==================== OPEN/CLOSE SIDE EFFECTS ====================
const resetPanelStyle = () => {
	const el = menuRef.value;
	if (!el) return;
	el.style.transform = "";
	el.style.opacity = "";
};

watch(
	() => props.isOpen,
	async (open) => {
		if (open) {
			lock();
			await nextTick();
			menuRef.value?.focus?.();
		} else {
			unlock();
			resetPanelStyle();
			isDragging.value = false;
		}
	},
	{ immediate: true },
);

// ==================== ACTIONS ====================
const close = () => {
	triggerLight();
	emit("close");
};

const toggleCategory = (id) => {
	const idx = selected.value.indexOf(id);
	if (idx === -1) selected.value.push(id);
	else selected.value.splice(idx, 1);
	triggerLight();
};

const applyFilters = () => {
	emit("apply", [...selected.value]);
	triggerMedium(); // Haptic feedback after successful apply
	emit("close");
};

const clearAll = () => {
	if (selected.value.length === 0) return;
	selected.value = [];
	triggerMedium();
};

// ==================== KEYBOARD ====================
const onKeydown = (e) => {
	if (!props.isOpen) return;
	if (e.key === "Escape") {
		e.preventDefault();
		close();
	}
};

// ==================== SWIPE TO CLOSE ====================
const SWIPE_ACTIVATE_PX = 12;
const SWIPE_CLOSE_PX = 110;
const MAX_SWIPE_PX = 280;
const ANGLE_RATIO = 1.35;

const onTouchStart = (e) => {
	const t = e.touches[0];
	startX.value = t.clientX;
	startY.value = t.clientY;
	currentX.value = t.clientX;
	currentY.value = t.clientY;
	isDragging.value = false;

	listScrollStart.value = listRef.value?.scrollTop || 0;
};

const onTouchMove = (e) => {
	if (!menuRef.value) return;

	const t = e.touches[0];
	currentX.value = t.clientX;
	currentY.value = t.clientY;

	const dx = currentX.value - startX.value;
	const dy = currentY.value - startY.value;

	const scrolled = (listRef.value?.scrollTop || 0) !== listScrollStart.value;
	if (scrolled) return;

	if (Math.abs(dx) < SWIPE_ACTIVATE_PX) return;
	if (!(Math.abs(dx) > Math.abs(dy) * ANGLE_RATIO)) return;
	if (dx <= 0) return;

	isDragging.value = true;

	if (e.cancelable) e.preventDefault();

	const clamped = Math.min(dx, MAX_SWIPE_PX);
	const opacity = Math.max(0.35, 1 - clamped / 320);

	menuRef.value.style.transform = `translateX(${clamped}px)`;
	menuRef.value.style.opacity = `${opacity}`;
};

const onTouchEnd = () => {
	if (!menuRef.value) return;

	const dx = currentX.value - startX.value;

	if (isDragging.value && dx > SWIPE_CLOSE_PX) {
		triggerMedium();
		emit("close");
		return;
	}

	resetPanelStyle();
	isDragging.value = false;
};

// ==================== LIFECYCLE ====================
onMounted(() => {
	document.addEventListener("keydown", onKeydown, { passive: true });
});

onUnmounted(() => {
	document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-labelledby="filter-menu-title"
    class="fixed inset-0 z-[9999] flex items-start justify-end p-4 pt-16 safe-area-padding"
  >
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity backdrop-optimized"
      :class="{ 'pointer-events-none': isDragging }"
      @click="close"
      @touchmove.prevent
      @touchstart.prevent
      aria-hidden="true"
    />

    <div
      ref="menuRef"
      tabindex="-1"
      data-testid="filter-menu"
      class="relative w-[50vw] min-w-[180px] max-w-[220px] sm:max-w-[260px] bg-glass backdrop-blur-glass border border-glass-border rounded-3xl shadow-glass-elevated overflow-hidden flex flex-col animate-slide-in-spring touch-pan-y outline-none"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div
        class="p-4 pb-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-br from-white/10 to-white/5"
      >
        <div class="flex items-center gap-3">
          <h2
            id="filter-menu-title"
            class="text-base font-black text-white uppercase tracking-widest"
          >
            Filter Vibe
          </h2>

          <div
            v-if="selectedCount > 0"
            class="px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 text-white text-xs font-bold animate-scale-in"
            aria-live="polite"
            :aria-label="`${selectedCount} filters selected`"
          >
            {{ selectedCount }}
          </div>
        </div>

        <button
          @click="close"
          aria-label="Close filter menu"
          class="min-w-[44px] min-h-[44px] w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all touch-target"
        >
          <X class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref="listRef"
        class="flex-1 p-3 space-y-2 overflow-y-auto overscroll-contain ios-scroll"
        role="group"
        aria-label="Filter categories"
      >
        <TransitionGroup name="stagger-list">
          <button
            v-for="(cat, index) in FILTER_CATEGORIES"
            :key="cat.id"
            @click="toggleCategory(cat.id)"
            :aria-pressed="selectedSet.has(cat.id)"
            :aria-label="`${cat.label} filter, ${selectedSet.has(cat.id) ? 'selected' : 'not selected'}`"
            class="filter-button w-full flex items-center justify-between min-h-[52px] p-4 rounded-2xl transition-all touch-target"
            :class="[
              selectedSet.has(cat.id)
                ? `bg-gradient-to-r ${cat.gradient} border-2 border-white/30 shadow-glow ${cat.glow} selected`
                : 'bg-white/5 hover:bg-white/10 active:bg-white/15 border-2 border-transparent',
            ]"
            :style="{ '--stagger-delay': `${index * 50}ms` }"
          >
            <div class="flex items-center gap-3">
              <component
                :is="cat.icon"
                class="w-5 h-5 transition-all icon-animate"
                :class="[selectedSet.has(cat.id) ? 'text-white scale-110' : cat.iconColor]"
                aria-hidden="true"
              />
              <span
                class="text-base font-bold transition-colors"
                :class="selectedSet.has(cat.id) ? 'text-white' : 'text-white/90'"
              >
                {{ cat.label }}
              </span>
            </div>

            <Transition name="check-bounce">
              <div
                v-if="selectedSet.has(cat.id)"
                class="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center check-pulse"
                aria-hidden="true"
              >
                <Check class="w-4 h-4 text-white" stroke-width="3" />
              </div>
            </Transition>
          </button>
        </TransitionGroup>
      </div>

      <div
        class="p-3 pb-safe border-t border-white/10 bg-gradient-to-br from-black/40 to-black/60 space-y-2"
      >
        <Transition name="fade-scale">
          <button
            v-if="selectedCount > 0"
            @click="clearAll"
            aria-label="Clear all filters"
            class="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white font-bold text-sm uppercase tracking-wide transition-all active:scale-95 touch-target"
          >
            Clear All ({{ selectedCount }})
          </button>
        </Transition>

        <button
          @click="applyFilters"
          aria-label="Apply selected filters"
          class="w-full py-3.5 rounded-xl bg-gradient-to-r from-white to-white/95 text-black font-black text-sm uppercase tracking-widest hover:shadow-xl active:scale-[0.98] transition-all shadow-lg touch-target"
        >
          Apply Filters
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* SAFE AREA */
.safe-area-padding {
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
}
.pb-safe {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

/* GLASS */
.bg-glass {
  background: rgba(20, 20, 30, 0.85);
}
.backdrop-blur-glass {
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}
.border-glass-border {
  border-color: rgba(255, 255, 255, 0.15);
}
.shadow-glass-elevated {
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 1px rgba(255, 255, 255, 0.1) inset;
}

/* GPU */
.backdrop-optimized {
  will-change: opacity;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

/* iOS scroll */
.ios-scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.overscroll-contain {
  overscroll-behavior: contain;
}
.touch-pan-y {
  touch-action: pan-y;
}

/* touch targets */
.touch-target {
  min-width: 44px;
  min-height: 44px;
}

/* spring in */
@keyframes slide-in-spring {
  0% { opacity: 0; transform: translateX(100%) scale(0.95); }
  60% { transform: translateX(-8px) scale(1.01); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
.animate-slide-in-spring {
  animation: slide-in-spring 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* glow */
.shadow-glow {
  box-shadow:
    0 0 20px rgba(255, 255, 255, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.3);
}
.filter-button.selected {
  transform: scale(1.02);
}

/* icon bounce */
.icon-animate {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.selected .icon-animate {
  animation: icon-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes icon-bounce {
  0%, 100% { transform: scale(1.1); }
  50% { transform: scale(1.3) rotate(-5deg); }
}

/* check pulse */
.check-pulse {
  animation: pulse-glow 2s ease-in-out infinite;
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(255, 255, 255, 0.25); }
  50% { box-shadow: 0 0 16px rgba(255, 255, 255, 0.45); }
}

/* stagger */
.stagger-list-enter-active {
  transition:
    opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition-delay: var(--stagger-delay, 0ms);
}
.stagger-list-enter-from {
  opacity: 0;
  transform: translateX(20px) scale(0.9);
}
.stagger-list-leave-active {
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;
}
.stagger-list-leave-to {
  opacity: 0;
  transform: translateX(-20px) scale(0.9);
}

/* check bounce */
.check-bounce-enter-active {
  animation: check-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.check-bounce-leave-active {
  animation: check-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) reverse;
}
@keyframes check-pop {
  0% { transform: scale(0) rotate(-180deg); opacity: 0; }
  70% { transform: scale(1.2) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

/* scale in */
@keyframes scale-in {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-scale-in {
  animation: scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* fade scale */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
}

/* reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .animate-slide-in-spring,
  .icon-animate,
  .check-pulse {
    animation: none !important;
  }
  .filter-button.selected {
    transform: none;
  }
}

/* focus */
button:focus-visible {
  outline: 3px solid rgba(59, 130, 246, 0.8);
  outline-offset: 2px;
}

/* high contrast */
@media (prefers-contrast: high) {
  .bg-glass {
    background: rgba(0, 0, 0, 0.95);
  }
  .border-glass-border {
    border-color: rgba(255, 255, 255, 0.5);
  }
  .filter-button {
    border-width: 2px;
  }
}
</style>
