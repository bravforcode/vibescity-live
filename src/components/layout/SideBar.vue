<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useShopFilters } from "../../composables/useShopFilters";
import { Z } from "../../constants/zIndex";
import { getStatusColorClass, isFlashActive } from "../../utils/shopUtils";

const { t } = useI18n();

// ==================== PROPS & EMITS ====================
const props = defineProps({
	isOpen: Boolean,
	shops: {
		type: Array,
		default: () => [],
		validator: (value) => Array.isArray(value),
	},
	activeCategories: {
		type: Array,
		default: () => [],
	},
	activeStatus: {
		type: String,
		default: "ALL",
	},
});

const emit = defineEmits([
	"close",
	"update:categories",
	"update:status",
	"select-shop",
	"open-ride-modal",
]);

// ==================== STATE ====================
const isFiltersExpanded = ref(false);
const selectedShopId = ref(null);
const isClosing = ref(false);
const sidebarRef = ref(null);
const firstFocusableRef = ref(null);
const lastFocusableRef = ref(null);

// ==================== COMPUTED PROPERTIES (Performance Optimization) ====================
// ใช้ computed แทน toRefs เพื่อลด reactivity overhead
const { uniqueCategories, sortedShops } = useShopFilters(
	computed(() => props.shops),
	computed(() => props.activeCategories),
	computed(() => props.activeStatus),
);

// Pre-compute shop metadata เพื่อหลีกเลี่ยงการคำนวณซ้ำใน template
const enrichedShops = computed(() => {
	return sortedShops.value.map((shop) => ({
		...shop,
		_isFlash: isFlashActive(shop),
		_statusClass: getStatusColorClass(shop.status),
		_badgeType: shop.isGolden
			? "highlight"
			: isFlashActive(shop)
				? "flash"
				: "status",
	}));
});

const liveShopsCount = computed(
	() => enrichedShops.value.filter((s) => s.status === "LIVE").length,
);
const categories = computed(() => uniqueCategories.value);
const statuses = ["ALL", "LIVE", "TONIGHT", "OFF"];

// Active filter summary
const activeFilterSummary = computed(() => {
	const catText =
		props.activeCategories.length > 0
			? props.activeCategories.join(", ")
			: "ALL";
	return `${catText} • ${props.activeStatus}`;
});

// Count active filters for badge
const activeFilterCount = computed(() => {
	let count = 0;
	if (props.activeCategories.length > 0) count += props.activeCategories.length;
	if (props.activeStatus !== "ALL") count += 1;
	return count;
});

// ==================== METHODS ====================
const toggleCategory = (cat) => {
	const updated = [...props.activeCategories];
	const idx = updated.indexOf(cat);

	if (idx > -1) {
		updated.splice(idx, 1);
	} else {
		updated.push(cat);
	}

	emit("update:categories", updated);
};

const resetCategories = () => {
	emit("update:categories", []);
};

const selectStatus = (stat) => {
	emit("update:status", stat);
};

const resetAllFilters = () => {
	resetCategories();
	selectStatus("ALL");
};

// Improved shop click handler with visual feedback before closing
const handleShopClick = async (shop) => {
	if (isClosing.value) return;

	// Set selected state for visual feedback
	selectedShopId.value = shop.id;

	// Emit selection immediately
	emit("select-shop", shop);

	// Wait for animation feedback (300ms) before closing
	await new Promise((resolve) => setTimeout(resolve, 300));

	// Close sidebar
	isClosing.value = true;
	emit("close");

	// Reset states after transition
	await new Promise((resolve) => setTimeout(resolve, 400));
	selectedShopId.value = null;
	isClosing.value = false;
};

// ==================== KEYBOARD NAVIGATION ====================
const handleKeyDown = (event) => {
	if (!props.isOpen) return;

	// ESC to close
	if (event.key === "Escape") {
		emit("close");
		return;
	}

	// Tab trapping
	if (event.key === "Tab") {
		const focusableElements = sidebarRef.value?.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);

		if (!focusableElements || focusableElements.length === 0) return;

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		if (event.shiftKey) {
			if (document.activeElement === firstElement) {
				lastElement.focus();
				event.preventDefault();
			}
		} else {
			if (document.activeElement === lastElement) {
				firstElement.focus();
				event.preventDefault();
			}
		}
	}
};

// ==================== LIFECYCLE ====================
watch(
	() => props.isOpen,
	async (isOpen) => {
		if (isOpen) {
			// Add keyboard listener
			document.addEventListener("keydown", handleKeyDown);

			// Prevent body scroll
			document.body.style.overflow = "hidden";

			// Focus first element
			await nextTick();
			const firstButton = sidebarRef.value?.querySelector("button");
			firstButton?.focus();
		} else {
			// Remove keyboard listener
			document.removeEventListener("keydown", handleKeyDown);

			// Restore body scroll
			document.body.style.overflow = "";

			// Reset states
			selectedShopId.value = null;
			isClosing.value = false;
		}
	},
);

onUnmounted(() => {
	document.removeEventListener("keydown", handleKeyDown);
	document.body.style.overflow = "";
});
</script>

<template>
  <div class="pointer-events-none">
    <!-- Backdrop -->
    <transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto sm:hidden"
        :style="{ zIndex: Z.SIDEBAR_BACKDROP }"
        @click="emit('close')"
        aria-hidden="true"
      ></div>
    </transition>

    <!-- Sidebar Panel -->
    <transition name="slide">
      <div
        v-if="isOpen"
        ref="sidebarRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-title"
        class="fixed inset-y-0 left-0 w-[290px] bg-zinc-950/95 backdrop-blur-2xl border-r border-white/10 pointer-events-auto flex flex-col shadow-2xl p-0 m-0"
        :style="{ zIndex: Z.SIDEBAR }"
      >
        <!-- Header -->
        <div
          class="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950"
        >
          <h2
            id="sidebar-title"
            class="text-white font-black uppercase tracking-tighter text-xl leading-none"
          >
            {{ t("sidebar.title") }}
          </h2>
          <button
            ref="firstFocusableRef"
            @click="emit('close')"
            class="text-white/30 hover:text-white transition-all p-1 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20"
            aria-label="Close sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto no-scrollbar flex flex-col">
          <!-- Filter Control -->
          <div class="border-b border-white/5 bg-zinc-900/30">
            <button
              @click="isFiltersExpanded = !isFiltersExpanded"
              :aria-expanded="isFiltersExpanded"
              aria-controls="filters-panel"
              class="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all group focus:outline-none focus:bg-white/5"
            >
              <div class="flex flex-col items-start gap-0.5">
                <span
                  class="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]"
                >
                  {{ t("sidebar.active_filters") }}
                  <span v-if="activeFilterCount > 0" class="ml-1 text-white/50"
                    >({{ activeFilterCount }})</span
                  >
                </span>
                <p
                  class="text-[11px] text-white/80 font-bold uppercase tracking-widest truncate max-w-[170px]"
                >
                  {{ activeFilterSummary }}
                </p>
              </div>
              <div
                :class="[
                  'p-2 rounded-lg transition-all border border-white/10 group-hover:border-white/30',
                  isFiltersExpanded
                    ? 'bg-white text-black'
                    : 'bg-black/50 text-white',
                ]"
                aria-hidden="true"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-180': isFiltersExpanded }"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </div>
            </button>

            <!-- Expanded Filters Panel -->
            <transition name="expand">
              <div
                v-if="isFiltersExpanded"
                id="filters-panel"
                class="px-6 pb-6 overflow-hidden space-y-6 pt-2"
              >
                <!-- Status Filter -->
                <div
                  class="space-y-3"
                  role="group"
                  aria-labelledby="status-filter-label"
                >
                  <span
                    id="status-filter-label"
                    class="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]"
                  >
                    {{ t("sidebar.quick_status") }}
                  </span>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="status in statuses"
                      :key="status"
                      @click="selectStatus(status)"
                      :aria-pressed="activeStatus === status"
                      :aria-label="`Filter by ${status.toLowerCase()} status`"
                      :class="[
                        'h-9 px-3 text-left text-[10px] font-black uppercase tracking-widest transition-all border rounded-sm focus:outline-none focus:ring-2 focus:ring-white/30',
                        activeStatus === status
                          ? 'bg-white text-black border-white shadow-lg'
                          : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white/70',
                      ]"
                    >
                      {{ status }}
                    </button>
                  </div>
                </div>

                <!-- Category Filter -->
                <div
                  class="space-y-3"
                  role="group"
                  aria-labelledby="category-filter-label"
                >
                  <div class="flex items-center justify-between">
                    <span
                      id="category-filter-label"
                      class="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]"
                    >
                      {{ t("sidebar.categories") }}
                    </span>
                    <button
                      @click="resetCategories"
                      :disabled="activeCategories.length === 0"
                      :class="[
                        'text-[9px] font-black uppercase tracking-widest transition-colors rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400',
                        activeCategories.length === 0
                          ? 'text-white/20 cursor-not-allowed'
                          : 'text-blue-500 hover:text-blue-400',
                      ]"
                      aria-label="Reset category filters"
                    >
                      {{ t("sidebar.reset") }}
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="cat in categories"
                      :key="cat"
                      @click="toggleCategory(cat)"
                      :aria-pressed="activeCategories.includes(cat)"
                      :aria-label="`Toggle ${cat} category`"
                      :class="[
                        'px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all border rounded-sm focus:outline-none focus:ring-2 focus:ring-white/30',
                        activeCategories.includes(cat)
                          ? 'bg-red-600 text-white border-red-600 shadow-md scale-105'
                          : 'bg-white/5 text-white/50 border-white/5 hover:border-white/20 hover:bg-white/10',
                      ]"
                    >
                      {{ cat }}
                    </button>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- Shop List Section -->
          <div class="flex-1 p-6 space-y-4">
            <div class="flex items-center justify-between">
              <span
                class="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]"
              >
                {{ t("sidebar.trending_now") }}
              </span>
              <div class="flex items-center gap-1.5" aria-live="polite">
                <div
                  class="w-1 h-1 bg-red-500 rounded-full animate-ping"
                  aria-hidden="true"
                ></div>
                <span
                  class="text-[9px] text-red-500 font-bold uppercase tracking-widest"
                >
                  {{ t("sidebar.live_count", { count: liveShopsCount }) }}
                </span>
              </div>
            </div>

            <!-- Shop List -->
            <div class="space-y-2" role="list">
              <div
                v-for="shop in enrichedShops"
                :key="shop.id"
                @click="handleShopClick(shop)"
                role="listitem"
                tabindex="0"
                @keydown.enter="handleShopClick(shop)"
                @keydown.space.prevent="handleShopClick(shop)"
                :aria-label="`${shop.name}, ${shop.status} status${shop._isFlash ? ', flash sale active' : ''}${shop.isGolden ? ', highlighted' : ''}`"
                :class="[
                  'group bg-white/5 hover:bg-white/10 border border-white/5 p-3 flex flex-col gap-2 cursor-pointer transition-all rounded-sm focus:outline-none focus:ring-2 focus:ring-white/30',
                  selectedShopId === shop.id
                    ? 'bg-white/20 border-white/20 scale-[0.98] ring-2 ring-white/50'
                    : 'active:scale-[0.98]',
                ]"
              >
                <div class="flex items-center justify-between gap-3">
                  <h3
                    class="text-xs font-black text-white/90 uppercase truncate flex-1 group-hover:text-white transition-colors"
                  >
                    {{ shop.name }}
                  </h3>

                  <!-- Priority Badge System -->
                  <!-- 1. HIGHLIGHT Badge -->
                  <div
                    v-if="shop._badgeType === 'highlight'"
                    class="sidebar-highlight-badge shrink-0"
                    role="status"
                    aria-label="Highlighted venue"
                  >
                    ⭐ HIGHLIGHT
                  </div>

                  <!-- 2. FLASH SALE Badge -->
                  <div
                    v-else-if="shop._badgeType === 'flash'"
                    class="sidebar-flash-badge shrink-0"
                    role="status"
                    aria-label="Flash sale active"
                  >
                    ⚡ FLASH
                  </div>

                  <!-- 3. STATUS Badge -->
                  <div
                    v-else
                    :class="[
                      'px-1.5 py-0.5 text-[8px] font-black text-white rounded-[4px] shrink-0 uppercase',
                      shop._statusClass,
                    ]"
                    role="status"
                    :aria-label="`${shop.status} status`"
                  >
                    {{ shop.status }}
                  </div>
                </div>

                <!-- Flash Sale Info -->
                <div v-if="shop._isFlash" class="flex flex-col gap-1">
                  <p
                    class="text-[10px] font-bold text-red-400 uppercase tracking-tight"
                  >
                    🔥 {{ shop.promotionInfo }}
                  </p>
                </div>

                <!-- Additional Info -->
                <div class="flex items-center justify-between mt-1">
                  <div v-if="shop.category" class="flex items-center gap-2">
                    <span
                      class="text-[9px] text-white/30 uppercase tracking-wider"
                    >
                      {{ shop.category }}
                    </span>
                  </div>
                  <!-- ✅ Ride Button -->
                  <button
                    @click.stop="
                      emit('select-shop', shop);
                      emit('open-ride-modal', shop);
                    "
                    class="px-2 py-1 rounded bg-blue-600/20 text-blue-400 text-[10px] font-bold border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <span>🚗 Ride</span>
                  </button>
                </div>
              </div>

              <!-- Empty State -->
              <div
                v-if="enrichedShops.length === 0"
                class="py-12 text-center space-y-4"
                role="status"
                aria-live="polite"
              >
                <!-- Empty State Icon -->
                <div class="flex justify-center">
                  <div
                    class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-8 h-8 text-white/20"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>

                <div class="space-y-2">
                  <p
                    class="text-sm text-white/40 font-bold uppercase tracking-wide"
                  >
                    {{ t("sidebar.no_venues") }}
                  </p>
                  <p
                    class="text-[10px] text-white/20 font-medium max-w-[200px] mx-auto leading-relaxed"
                  >
                    {{ t("sidebar.adjust_filters") }}
                  </p>
                </div>

                <button
                  ref="lastFocusableRef"
                  @click="resetAllFilters"
                  class="mx-auto px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-sm transition-all border border-white/10 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                  aria-label="Clear all filters"
                >
                  {{ t("sidebar.clear_all") }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-white/5 bg-zinc-950">
          <p
            class="text-[9px] text-white/20 font-medium uppercase tracking-widest text-center"
          >
            {{ t("sidebar.footer", { year: new Date().getFullYear() }) }}
          </p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ==================== TRANSITIONS ==================== */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
  transition:
    max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 600px;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

/* ==================== SCROLLBAR ==================== */
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

/* ==================== BADGE STYLES ==================== */
/* Flash Sale Badge - Subtle animated gradient */
.sidebar-flash-badge {
  @apply px-2 py-0.5 text-[8px] font-black text-white rounded-[4px] uppercase tracking-wider;
  background: linear-gradient(90deg, #ef4444 0%, #f97316 50%, #ef4444 100%);
  background-size: 200% 100%;
  animation: flash-gradient 3s ease-in-out infinite;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
}

/* Highlight Badge - Premium gold look */
.sidebar-highlight-badge {
  @apply px-2 py-0.5 text-[8px] font-black rounded-[4px] uppercase tracking-wider;
  color: #78350f;
  background: linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%);
  box-shadow:
    0 2px 8px rgba(251, 191, 36, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(217, 119, 6, 0.3);
}

@keyframes flash-gradient {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* ==================== FOCUS VISIBLE ENHANCEMENT ==================== */
*:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  outline-offset: 2px;
}
</style>
