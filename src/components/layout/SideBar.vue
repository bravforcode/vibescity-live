<script setup>
import { ref, toRefs } from "vue";
import { useShopFilters } from "../../composables/useShopFilters";
import { getStatusColorClass, isFlashActive } from "../../utils/shopUtils";

const props = defineProps({
  isOpen: Boolean,
  shops: Array,
  activeCategories: Array,
  activeStatus: String,
});

const emit = defineEmits([
  "close",
  "update:categories",
  "update:status",
  "select-shop",
]);

const { shops, activeCategories, activeStatus } = toRefs(props);

const isFiltersExpanded = ref(false);

const { uniqueCategories, sortedShops } = useShopFilters(
  shops,
  activeCategories,
  activeStatus,
);
const categories = uniqueCategories;

const statuses = ["ALL", "LIVE", "TONIGHT", "OFF"];

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

const resetCategories = () => emit("update:categories", []);
const selectStatus = (stat) => emit("update:status", stat);

const handleShopClick = (shop) => {
  emit("select-shop", shop);
  emit("close");
};
</script>

<template>
  <div class="pointer-events-none">
    <!-- Backdrop -->
    <transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4500] pointer-events-auto sm:hidden"
        @click="emit('close')"
      ></div>
    </transition>

    <!-- Sidebar Panel -->
    <transition name="slide">
      <div
        v-if="isOpen"
        class="fixed inset-y-0 left-0 w-[290px] bg-zinc-950/95 backdrop-blur-2xl border-r border-white/10 z-[5000] pointer-events-auto flex flex-col shadow-2xl"
      >
        <!-- Header -->
        <div
          class="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950"
        >
          <h2
            class="text-white font-black uppercase tracking-tighter text-xl leading-none"
          >
            VibesCity.live
          </h2>
          <button
            @click="emit('close')"
            class="text-white/30 hover:text-white transition-all p-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
          <!-- Filter Control (Same as before) -->
          <div class="border-b border-white/5 bg-zinc-900/30">
            <button
              @click="isFiltersExpanded = !isFiltersExpanded"
              class="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all group"
            >
              <div class="flex flex-col items-start gap-0.5">
                <span
                  class="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]"
                  >Active Filters</span
                >
                <p
                  class="text-[11px] text-white/80 font-bold uppercase tracking-widest truncate max-w-[170px]"
                >
                  {{
                    activeCategories.length > 0
                      ? activeCategories.join(", ")
                      : "ALL"
                  }}
                  • {{ activeStatus }}
                </p>
              </div>
              <div
                :class="[
                  'p-2 rounded-lg transition-all border border-white/10 group-hover:border-white/30',
                  isFiltersExpanded
                    ? 'bg-white text-black'
                    : 'bg-black/50 text-white',
                ]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4"
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
                class="px-6 pb-6 overflow-hidden space-y-6 pt-2"
              >
                <!-- Status Filter -->
                <div class="space-y-3">
                  <span
                    class="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]"
                    >Quick Status</span
                  >
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="status in statuses"
                      :key="status"
                      @click="selectStatus(status)"
                      :class="[
                        'h-9 px-3 text-left text-[10px] font-black uppercase tracking-widest transition-all border',
                        activeStatus === status
                          ? 'bg-white text-black border-white shadow-lg'
                          : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10',
                      ]"
                    >
                      {{ status }}
                    </button>
                  </div>
                </div>

                <!-- Category Filter -->
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span
                      class="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]"
                      >Categories</span
                    >
                    <button
                      @click="resetCategories"
                      class="text-[9px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors"
                    >
                      RESET
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="cat in categories"
                      :key="cat"
                      @click="toggleCategory(cat)"
                      :class="[
                        'px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all border',
                        activeCategories.includes(cat)
                          ? 'bg-red-600 text-white border-red-600 shadow-md'
                          : 'bg-white/5 text-white/50 border-white/5 hover:border-white/20',
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
                >Trending Now</span
              >
              <div class="flex items-center gap-1.5">
                <div class="w-1 h-1 bg-red-500 rounded-full animate-ping"></div>
                <span
                  class="text-[9px] text-red-500 font-bold uppercase tracking-widest"
                  >Live Sorting</span
                >
              </div>
            </div>

            <div class="space-y-2">
              <div
                v-for="shop in sortedShops"
                :key="shop.id"
                @click="handleShopClick(shop)"
                class="group bg-white/5 hover:bg-white/10 border border-white/5 p-3 flex flex-col gap-2 cursor-pointer transition-all active:scale-[0.98] rounded-sm"
              >
                <div class="flex items-center justify-between gap-3">
                  <h3
                    class="text-xs font-black text-white/90 uppercase truncate flex-1 group-hover:text-white"
                  >
                    {{ shop.name }}
                  </h3>

                  <!-- 1. PRIORITY BADGE: Golden Time -->
                  <div
                    v-if="shop.isGolden"
                    class="sidebar-highlight-badge shrink-0"
                  >
                    HIGHLIGHT
                  </div>

                  <!-- 2. PRIORITY BADGE: Flash Sale -->
                  <div
                    v-else-if="isFlashActive(shop)"
                    class="sidebar-flash-badge shrink-0"
                  >
                    FLASH SALE
                  </div>

                  <!-- 3. NORMAL BADGE: Live / Tonight / Off -->
                  <div
                    v-else
                    :class="[
                      'px-1.5 py-0.5 text-[8px] font-black text-white rounded-[4px] shrink-0',
                      getStatusColorClass(shop.status),
                    ]"
                  >
                    {{ shop.status }}
                  </div>
                </div>

                <div v-if="isFlashActive(shop)" class="flex flex-col gap-1">
                  <p
                    class="text-[10px] font-black text-red-500/90 uppercase tracking-tight italic"
                  >
                    🔥 {{ shop.promotionInfo }}
                  </p>
                </div>
              </div>

              <div
                v-if="sortedShops.length === 0"
                class="py-10 text-center space-y-2"
              >
                <p
                  class="text-[10px] text-white/20 font-black uppercase tracking-widest"
                >
                  No matching vibes
                </p>
                <button
                  @click="
                    resetCategories();
                    selectStatus('ALL');
                  "
                  class="text-[9px] text-blue-500 font-bold uppercase underline"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-white/5 bg-zinc-950">
          <p
            class="text-[9px] text-white/20 font-medium uppercase tracking-widest text-center italic"
          >
            @2026 All rights reserved
          </p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* คง Style เดิมไว้ */
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
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease-out;
  max-height: 600px;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

.sidebar-flash-badge {
  @apply px-1.5 py-0.5 text-[8px] font-black text-white rounded-[4px];
  background: linear-gradient(270deg, #ff4d4d, #f97316, #ff4d4d);
  background-size: 200% 200%;
  animation: wave-gradient 2s linear infinite;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

/* เพิ่ม Style สำหรับป้าย Highlight สีทอง */
.sidebar-highlight-badge {
  @apply px-1.5 py-0.5 text-[8px] font-black text-yellow-950 rounded-[4px];
  background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  letter-spacing: 0.05em;
}

@keyframes wave-gradient {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}
</style>
