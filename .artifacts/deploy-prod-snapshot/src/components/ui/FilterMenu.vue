<!-- src/components/ui/FilterMenu.vue -->
<script setup>
import { Check, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useBodyScrollLock } from "@/composables/useBodyScrollLock";
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

const isDragging = ref(false);
const startY = ref(0);
const currentY = ref(0);

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
	triggerMedium();
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

// ==================== SWIPE DOWN TO CLOSE ====================
const SWIPE_ACTIVATE_PX = 10;
const SWIPE_CLOSE_PX = 100;
const MAX_SWIPE_PX = 260;

const onTouchStart = (e) => {
	const t = e.touches[0];
	startY.value = t.clientY;
	currentY.value = t.clientY;
	isDragging.value = false;
};

const onTouchMove = (e) => {
	if (!menuRef.value) return;
	const t = e.touches[0];
	currentY.value = t.clientY;
	const dy = currentY.value - startY.value;

	if (dy < SWIPE_ACTIVATE_PX) return;
	isDragging.value = true;
	if (e.cancelable) e.preventDefault();

	const clamped = Math.min(dy, MAX_SWIPE_PX);
	const opacity = Math.max(0.4, 1 - clamped / 300);
	menuRef.value.style.transform = `translateY(${clamped}px)`;
	menuRef.value.style.opacity = `${opacity}`;
};

const onTouchEnd = () => {
	if (!menuRef.value) return;
	const dy = currentY.value - startY.value;
	if (isDragging.value && dy > SWIPE_CLOSE_PX) {
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
  <Transition name="filter-backdrop">
    <div
      v-if="isOpen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-menu-title"
      class="fixed inset-0 z-[9999] flex items-end"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="close"
        aria-hidden="true"
      />

      <!-- Bottom Sheet Panel -->
      <div
        ref="menuRef"
        tabindex="-1"
        data-testid="filter-menu"
        class="filter-sheet relative w-full rounded-t-3xl outline-none flex flex-col overflow-hidden"
        style="max-height: 72vh"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend.passive="onTouchEnd"
      >
        <!-- Drag Handle -->
        <div class="flex justify-center pt-3 pb-1 shrink-0">
          <div class="w-10 h-1 rounded-full bg-white/20"></div>
        </div>

        <!-- Header -->
        <div class="px-5 pb-3 pt-1 flex items-center justify-between shrink-0 border-b border-white/8">
          <div class="flex items-center gap-2.5">
            <h2
              id="filter-menu-title"
              class="text-base font-black text-white uppercase tracking-widest"
            >
              Filter
            </h2>
            <div
              v-if="selectedCount > 0"
              class="px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold"
              aria-live="polite"
            >
              {{ selectedCount }}
            </div>
          </div>
          <button
            @click="close"
            aria-label="Close filter menu"
            class="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-colors"
          >
            <X class="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <!-- Category Grid -->
        <div
          class="flex-1 overflow-y-auto overscroll-contain p-4 pb-2"
          style="-webkit-overflow-scrolling: touch"
          role="group"
          aria-label="Filter categories"
        >
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="cat in FILTER_CATEGORIES"
              :key="cat.id"
              @click="toggleCategory(cat.id)"
              :aria-pressed="selectedSet.has(cat.id)"
              :aria-label="`${cat.label}, ${selectedSet.has(cat.id) ? 'selected' : 'not selected'}`"
              class="cat-btn relative flex flex-col items-center gap-2 py-4 px-3 rounded-2xl transition-all duration-200 active:scale-95 border-2"
              :class="[
                selectedSet.has(cat.id)
                  ? `bg-gradient-to-br ${cat.gradient} border-white/30 text-white shadow-lg ${cat.glow} selected`
                  : 'bg-white/6 hover:bg-white/10 border-transparent text-white/70',
              ]"
            >
              <!-- Icon -->
              <div
                class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
                :class="selectedSet.has(cat.id) ? 'bg-white/25' : 'bg-white/8'"
              >
                <component
                  :is="cat.icon"
                  class="w-5 h-5 icon-animate"
                  :class="selectedSet.has(cat.id) ? 'text-white' : cat.iconColor"
                  aria-hidden="true"
                />
              </div>

              <!-- Label -->
              <span class="text-xs font-bold text-center leading-tight">
                {{ cat.label }}
              </span>

              <!-- Check badge -->
              <Transition name="check-pop">
                <div
                  v-if="selectedSet.has(cat.id)"
                  class="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Check class="w-3 h-3 text-white" stroke-width="3" />
                </div>
              </Transition>
            </button>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="p-4 pb-safe border-t border-white/8 space-y-2 shrink-0 bg-sheet-footer">
          <Transition name="fade-scale">
            <button
              v-if="selectedCount > 0"
              @click="clearAll"
              aria-label="Clear all filters"
              class="w-full py-3 rounded-xl bg-white/8 hover:bg-white/12 active:scale-[0.98] text-white/80 font-bold text-sm uppercase tracking-wide transition-all"
            >
              Clear All
            </button>
          </Transition>

          <button
            @click="applyFilters"
            aria-label="Apply selected filters"
            class="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-black text-sm uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-violet-500/30"
          >
            {{ selectedCount > 0 ? `Show Results (${selectedCount})` : 'Show All' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pb-safe {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.filter-sheet {
  background: rgba(18, 18, 28, 0.96);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.6), 0 -1px 0 rgba(255, 255, 255, 0.06) inset;
  will-change: transform;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.bg-sheet-footer {
  background: rgba(12, 12, 20, 0.9);
}

.bg-white\/6 { background: rgba(255,255,255,0.06); }
.bg-white\/8 { background: rgba(255,255,255,0.08); }
.bg-white\/12 { background: rgba(255,255,255,0.12); }
.bg-white\/25 { background: rgba(255,255,255,0.25); }
.border-white\/8 { border-color: rgba(255,255,255,0.08); }

/* Sheet enter/leave */
.filter-backdrop-enter-active,
.filter-backdrop-leave-active {
  transition: opacity 0.3s ease;
}
.filter-backdrop-enter-active .filter-sheet {
  animation: sheet-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.filter-backdrop-leave-active .filter-sheet {
  animation: sheet-down 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}
.filter-backdrop-enter-from,
.filter-backdrop-leave-to {
  opacity: 0;
}

@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes sheet-down {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}

/* Icon bounce on select */
.cat-btn.selected .icon-animate {
  animation: icon-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes icon-bounce {
  0%, 100% { transform: scale(1.1); }
  50%       { transform: scale(1.3) rotate(-8deg); }
}

/* Check pop */
.check-pop-enter-active { animation: pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.check-pop-leave-active { animation: pop-out 0.15s ease-in; }
@keyframes pop-in  { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes pop-out { from { transform: scale(1); opacity: 1; } to { transform: scale(0); opacity: 0; } }

/* Fade scale for clear button */
.fade-scale-enter-active { animation: fade-scale-in 0.2s ease; }
.fade-scale-leave-active { animation: fade-scale-out 0.15s ease; }
@keyframes fade-scale-in  { from { opacity: 0; transform: scaleY(0.8); } to { opacity: 1; transform: scaleY(1); } }
@keyframes fade-scale-out { from { opacity: 1; transform: scaleY(1); } to { opacity: 0; transform: scaleY(0.8); } }

.shadow-glow {
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
}
</style>
