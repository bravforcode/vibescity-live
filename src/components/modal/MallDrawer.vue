<script setup>
import { ref, computed, watch, nextTick } from "vue";
// import ShopCard from "../panel/ShopCard.vue"; // Optional: Reuse if needed, but custom list item is better for this view

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  building: {
    type: Object,
    default: null,
  },
  shops: {
    type: Array,
    default: () => [],
  },
  // If true, data is treated as an Event
  isEventMode: {
    type: Boolean,
    default: true,
  },
  isDarkMode: {
    type: Boolean,
    default: true,
  },
  favorites: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  "close",
  "select-shop",
  "open-ride-modal",
  "toggle-favorite",
]);

const activeTab = ref("ALL"); // ALL, Food, Fashion, Beauty, Tech, Cinema
const searchQuery = ref("");
const isSearchExpanded = ref(false); // New state for compact search
const searchInputRef = ref(null);

// Reset state when building changes or drawer opens
watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      activeTab.value = "ALL";
      searchQuery.value = "";
      isSearchExpanded.value = false;
    }
  }
);

const handleExpandSearch = () => {
  isSearchExpanded.value = true;
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const handleClearSearch = () => {
  searchQuery.value = "";
  isSearchExpanded.value = false;
};

// Derived Categories based on data or static list
const categories = [
  { id: "ALL", label: "ทั้งหมด" },
  { id: "Food", label: "อาหาร" },
  { id: "Fashion", label: "แฟชั่น" },
  { id: "Beauty", label: "เครื่องประดับ" },
  { id: "Tech", label: "ไอที" },
  { id: "Cinema", label: "บันเทิง" },
];

// Computed Filtered Shops
const filteredShops = computed(() => {
  let result = props.shops;

  // 1. Filter by Tab
  if (activeTab.value !== "ALL") {
    // Simple mapping logic - adjust based on actual CSV categories
    const tab = activeTab.value;
    result = result.filter((s) => {
      const cat = (s.category || "").toLowerCase();
      if (tab === "Food")
        return (
          cat.includes("food") ||
          cat.includes("restaurant") ||
          cat.includes("cafe") ||
          cat.includes("bar")
        );
      if (tab === "Fashion")
        return (
          cat.includes("fashion") ||
          cat.includes("clothing") ||
          cat.includes("bag")
        );
      if (tab === "Beauty")
        return (
          cat.includes("beauty") ||
          cat.includes("jewelry") ||
          cat.includes("cosmetic")
        );
      if (tab === "Tech")
        return (
          cat.includes("tech") ||
          cat.includes("gadget") ||
          cat.includes("mobile")
        );
      if (tab === "Cinema")
        return (
          cat.includes("cinema") ||
          cat.includes("movie") ||
          cat.includes("game")
        );
      return true;
    });
  }

  // 2. Filter by Search
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q)
    );
    return result; // ถ้า search ให้โชว์ผลลัพธ์เลย (ไม่ Random)
  }

  // 3. Highlight/Random View (When Tab is ALL and No Search)
  if (activeTab.value === "ALL" && !searchQuery.value) {
    // Logic: Pick LIVE shops first, then Randomly pick some others to look "Full" but not overwhelming
    const liveShops = result.filter((s) => s.status === "LIVE");
    const otherShops = result.filter((s) => s.status !== "LIVE");

    // Shuffle others (Simple randomize for "Discovery" feel)
    const shuffled = otherShops.sort(() => 0.5 - Math.random());

    return [...liveShops, ...shuffled];
  }

  // 4. Sort: Live first, then by Floor (For Tab Views)
  return result.sort((a, b) => {
    // Live priority
    const aLive = a.status === "LIVE" ? 1 : 0;
    const bLive = b.status === "LIVE" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;

    // Then Floor
    return (a.Floor || "").localeCompare(b.Floor || "");
  });
});

const handleShare = (item) => {
  const name = item.name || item.EventName || "Amazing Vibe";
  const url = window.location.href + `?shop=${item.id}`;

  if (navigator.share) {
    navigator
      .share({
        title: `Check out ${name} on VibeCity!`,
        text: `Hey! found this cool place on VibeCity.live`,
        url: url,
      })
      .catch(console.error);
  } else {
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  }
};
</script>

<template>
  <transition name="drawer-slide">
    <div
      v-if="isOpen"
      class="fixed inset-x-0 bottom-0 h-[85%] z-[7000] flex flex-col rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden"
      :class="isDarkMode ? 'bg-zinc-900' : 'bg-white'"
    >
      <!-- Header Image Area -->
      <div class="relative h-48 flex-shrink-0">
        <!-- Background Image -->
        <div class="absolute inset-0">
          <img
            v-if="building?.Image_URL || building?.image"
            :src="building?.Image_URL || building?.image"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-black"
          ></div>
          <!-- Gradient Overlay -->
          <div
            class="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent"
          ></div>
        </div>

        <!-- Close Button -->
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-all z-20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <!-- Title Info -->
        <div class="absolute bottom-4 left-6 right-6">
          <div class="flex items-center gap-3 mb-1">
            <div
              class="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg"
            >
              <span class="text-2xl">🏢</span>
            </div>
            <div>
              <h2
                class="text-2xl font-bold text-white leading-tight shadow-black drop-shadow-md"
              >
                {{ building?.name || "Shopping Mall" }}
              </h2>
              <p class="text-white/70 text-sm">
                {{ building?.zone || "Chiang Mai" }}
              </p>
            </div>
          </div>

          <div class="flex gap-2 mt-2">
            <span
              class="px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold"
            >
              OPEN NOW
            </span>
            <span
              class="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px]"
            >
              10:00 - 22:00
            </span>
          </div>
        </div>

        <!-- Action Buttons (Favorite & Share) -->
        <div class="absolute bottom-4 right-6 flex gap-2 z-20">
          <button
            @click.stop="emit('toggle-favorite', building.id || building.key)"
            class="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 border"
            :class="[
              favorites.includes(Number(building.id || building.key))
                ? 'bg-pink-500 border-pink-400 text-white'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20',
            ]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              :fill="
                favorites.includes(Number(building.id || building.key))
                  ? 'currentColor'
                  : 'none'
              "
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </button>
          <button
            @click.stop="handleShare(building)"
            class="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all active:scale-90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- ✅ EVENT CONTENT (Scrollable) -->
      <div
        v-if="building?.isEvent"
        class="flex-1 overflow-y-auto pb-safe-offset"
      >
        <!-- 1. Highlights Section -->
        <div class="px-4 py-4">
          <h3
            class="text-lg font-bold mb-3"
            :class="isDarkMode ? 'text-white' : 'text-gray-900'"
          >
            🔥 Highlights
          </h3>
          <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            <!-- Video/Image Cards -->
            <div
              v-for="(hl, idx) in building.highlights || []"
              :key="idx"
              class="flex-shrink-0 w-64 h-36 rounded-xl overflow-hidden relative shadow-md bg-gray-800"
            >
              <img :src="hl.src" class="w-full h-full object-cover" />
            </div>
            <!-- Mock if empty -->
            <div
              v-if="!building.highlights?.length"
              class="w-full h-36 bg-gray-800 rounded-xl flex items-center justify-center text-white/30"
            >
              No Highlights
            </div>
          </div>
          <p
            class="text-sm opacity-80 mt-2 leading-relaxed"
            :class="isDarkMode ? 'text-gray-300' : 'text-gray-600'"
          >
            {{ building.description }}
          </p>
        </div>

        <!-- 2. Food Zones -->
        <div class="px-4 py-2">
          <h3
            class="text-lg font-bold mb-3"
            :class="isDarkMode ? 'text-white' : 'text-gray-900'"
          >
            🍽️ โซนอาหาร (Food)
          </h3>
          <div class="space-y-3">
            <div
              v-for="(zone, idx) in building.zones || []"
              :key="idx"
              class="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5"
            >
              <div
                class="w-20 h-20 rounded-xl bg-gray-700 overflow-hidden flex-shrink-0"
              >
                <img :src="zone.image" class="w-full h-full object-cover" />
              </div>
              <div>
                <h4
                  class="font-bold text-base"
                  :class="isDarkMode ? 'text-white' : 'text-gray-900'"
                >
                  {{ zone.title }}
                </h4>
                <p class="text-xs opacity-60">{{ zone.description }}</p>
                <span
                  class="inline-block mt-2 px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 text-[10px] font-bold"
                  >Recommended</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Music & Activities -->
        <div class="px-4 py-4">
          <h3
            class="text-lg font-bold mb-3"
            :class="isDarkMode ? 'text-white' : 'text-gray-900'"
          >
            🎵 กิจกรรม & ดนตรี
          </h3>
          <div class="relative pl-4 border-l-2 border-white/10 space-y-6">
            <div
              v-for="(act, idx) in building.timeline || []"
              :key="idx"
              class="relative"
            >
              <div
                class="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-black"
              ></div>
              <div class="text-xs font-bold text-blue-400 mb-0.5">
                {{ act.time }}
              </div>
              <div
                class="text-sm font-medium"
                :class="isDarkMode ? 'text-white' : 'text-gray-800'"
              >
                {{ act.activity }}
              </div>
            </div>
          </div>
        </div>

        <!-- 4. CTA Buttons -->
        <div class="px-4 py-6 flex flex-col gap-3">
          <button
            class="w-full py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <span>📍</span> นำทางไปงาน
          </button>
          <button
            @click="emit('open-ride-modal', building)"
            class="w-full py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <span>🚕</span> เรียกรถไปงาน
          </button>
        </div>
      </div>

      <!-- ✅ FALLBACK: OLD SHOP LIST (If not event) -->
      <div v-else class="flex flex-col flex-1 h-full overflow-hidden">
        <!-- Tools: Tabs & Search (Compact Mode) -->
        <div
          class="flex-shrink-0 px-4 py-3 border-b flex items-center gap-2"
          :class="
            isDarkMode
              ? 'border-white/5 bg-zinc-900'
              : 'border-gray-100 bg-white'
          "
        >
          <!-- Mode 1: Tabs + Search Icon -->
          <div
            v-if="!isSearchExpanded"
            class="flex-1 flex items-center justify-between min-w-0"
          >
            <!-- Horizontal Scrollable Tabs -->
            <div class="flex overflow-x-auto no-scrollbar gap-2 pb-1 pr-2">
              <button
                v-for="cat in categories"
                :key="cat.id"
                @click="activeTab = cat.id"
                class="px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                :class="[
                  activeTab === cat.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : isDarkMode
                    ? 'bg-white/5 text-white/70 hover:bg-white/10'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                ]"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Small Magnifying Glass Button -->
            <button
              @click="handleExpandSearch"
              class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all"
              :class="
                isDarkMode
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              "
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </div>

          <!-- Mode 2: Expanded Search Input -->
          <div v-else class="flex-1 flex items-center gap-2 animate-fade-in">
            <div class="relative flex-1">
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                placeholder="ค้นหาร้านในห้าง..."
                class="w-full pl-10 pr-4 py-2 rounded-xl text-sm transition-all outline-none"
                :class="
                  isDarkMode
                    ? 'bg-black/30 text-white placeholder-white/30 border border-white/10 focus:border-blue-500/50'
                    : 'bg-gray-50 text-gray-900 border border-gray-200 focus:border-blue-500'
                "
                @blur="!searchQuery && (isSearchExpanded = false)"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <!-- Cancel Button -->
            <button
              @click="handleClearSearch"
              class="text-xs font-bold"
              :class="
                isDarkMode
                  ? 'text-white/60 hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
              "
            >
              ยกเลิก
            </button>
          </div>
        </div>

        <!-- Content List -->
        <div class="flex-1 overflow-y-auto px-4 py-2 space-y-3 pb-safe-offset">
          <!-- Loading State (Optional) -->
          <div
            v-if="filteredShops.length === 0"
            class="py-10 text-center opacity-50"
          >
            <p>ไม่พบร้านค้าในหมวดนี้</p>
          </div>

          <!-- Shop Items -->
          <div
            v-for="shop in filteredShops"
            :key="shop.id"
            @click="emit('select-shop', shop)"
            class="flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer group active:scale-[0.98]"
            :class="
              isDarkMode
                ? 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10'
                : 'bg-white hover:bg-gray-50 border border-gray-100 shadow-sm'
            "
          >
            <!-- Image -->
            <div
              class="w-16 h-16 rounded-xl overflow-hidden relative flex-shrink-0 bg-gray-500"
            >
              <img
                v-if="shop.Image_URL1"
                :src="shop.Image_URL1"
                class="w-full h-full object-cover"
                loading="lazy"
              />
              <!-- Live Badge on Thumb -->
              <div
                v-if="shop.status === 'LIVE'"
                class="absolute bottom-0 inset-x-0 bg-red-600 text-white text-[8px] font-bold text-center py-0.5"
              >
                LIVE
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3
                class="text-sm font-bold truncate leading-tight"
                :class="isDarkMode ? 'text-white' : 'text-gray-900'"
              >
                {{ shop.name }}
              </h3>
              <p class="text-[11px] opacity-60 truncate">
                {{ shop.category || "Shop" }}
              </p>

              <!-- Floor / Zone Badges -->
              <div class="flex gap-2 mt-1.5">
                <span
                  class="text-[10px] font-medium opacity-80 flex items-center gap-1"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  ชั้น {{ shop.Floor || "?" }}
                </span>
                <span v-if="shop.Zone" class="text-[10px] opacity-60">
                  • {{ shop.Zone }}
                </span>
              </div>
              <p v-if="shop.openTime" class="text-[10px] opacity-50 mt-0.5">
                เปิด {{ shop.openTime }} - {{ shop.closeTime }}
              </p>
            </div>

            <!-- Action Buttons (Favorite & Share) -->
            <div class="flex items-center gap-1">
              <!-- Favorite -->
              <button
                @click.stop="emit('toggle-favorite', shop.id)"
                class="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90"
                :class="[
                  favorites.includes(Number(shop.id))
                    ? 'text-pink-500 bg-pink-500/10'
                    : 'text-gray-400 hover:text-pink-400 hover:bg-pink-400/5',
                ]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4"
                  :fill="
                    favorites.includes(Number(shop.id))
                      ? 'currentColor'
                      : 'none'
                  "
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </button>
              <!-- Share -->
              <button
                @click.stop="handleShare(shop)"
                class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-400/5 transition-all active:scale-90"
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
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              </button>
            </div>

            <!-- Live Status Indicator -->
            <div
              v-if="shop.status === 'LIVE'"
              class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse ml-1"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Backgroun Overlay -->
  <transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[6999]"
      @click="emit('close')"
    ></div>
  </transition>
</template>

<style scoped>
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pb-safe-offset {
  padding-bottom: env(safe-area-inset-bottom, 20px);
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
