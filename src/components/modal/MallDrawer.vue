// --- C:\vibecity.live\src\components\modal\MallDrawer.vue ---

<script setup>
import {
	Building2,
	Car,
	Heart,
	MapPin,
	Search,
	Share2,
	X,
} from "lucide-vue-next";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
import { resolveVenueMedia } from "@/domain/venue/viewModel";
import { Z } from "../../constants/zIndex";

const { t } = useI18n();
const { notifySuccess } = useNotifications();

const normalizeId = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const isSelectedShop = (shopId) => {
	const selected = normalizeId(props.selectedShopId);
	if (!selected) return false;
	return selected === normalizeId(shopId);
};

const isFavorited = (shopId) => {
	const id = normalizeId(shopId);
	if (!id) return false;
	return (props.favorites || []).some((fav) => normalizeId(fav) === id);
};

const getShopImage = (shop) => {
	const media = resolveVenueMedia(shop || {});
	return media.primaryImage || shop?.Image_URL1 || "";
};

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
	selectedShopId: {
		type: [String, Number],
		default: null,
	},
});

const emit = defineEmits([
	"close",
	"select-shop",
	"open-ride-modal",
	"toggle-favorite",
]);

const activeTab = ref("ALL"); // ALL, Food, Fashion, Beauty, Tech, Cinema
const activeFloor = ref(null); // Selected floor for Mall mode
const searchQuery = ref("");
const isSearchExpanded = ref(false); // New state for compact search
const searchInputRef = ref(null);
const drawerRef = ref(null);
const closeButtonRef = ref(null);
const drawerTitleId = "mall-drawer-title";

const scrollContainerRef = ref(null);
const shopRefs = ref({});
const focusableSelector =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
let previousFocusedElement = null;

// ✅ Check if building is currently open
const isBuildingOpen = computed(() => {
	if (!props.building?.openTime || !props.building?.closeTime) return true;
	const now = new Date();
	const time = now.getHours() * 100 + now.getMinutes();
	const open = parseInt(props.building.openTime.replace(":", ""));
	const close = parseInt(props.building.closeTime.replace(":", ""));
	return time >= open && time <= close;
});

// Reset state when building changes or drawer opens
const resetDrawerState = () => {
	activeTab.value = "ALL";
	searchQuery.value = "";
	isSearchExpanded.value = false;

	// Initialize floor for Mall mode
	if (props.building?.floors?.length) {
		// Default to first floor if none selected
		if (!activeFloor.value) {
			activeFloor.value = props.building.floors[0];
		}
	} else {
		activeFloor.value = null;
	}

	// Auto-scroll to selected shop if provided
	if (props.selectedShopId) {
		// Find shop info to auto-select its floor
		const shop = props.shops.find(
			(s) => normalizeId(s.id) === normalizeId(props.selectedShopId),
		);
		if (shop?.Floor) {
			activeFloor.value = shop.Floor;
		}

		nextTick(() => {
			setTimeout(() => {
				const el = shopRefs.value[props.selectedShopId];
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
				}
			}, 300); // Wait for transition
		});
	}
};

watch(
	() => props.isOpen,
	(val) => {
		if (val) {
			resetDrawerState();
			previousFocusedElement = document.activeElement;
			lockBodyScroll(true);
			document.addEventListener("keydown", handleDocumentKeydown);
			nextTick(() => closeButtonRef.value?.focus?.());
		} else {
			lockBodyScroll(false);
			document.removeEventListener("keydown", handleDocumentKeydown);
			if (previousFocusedElement?.focus) {
				nextTick(() => previousFocusedElement.focus());
			}
		}
	},
	{ immediate: true },
);

watch(
	() => props.building?.id,
	() => {
		if (props.isOpen) resetDrawerState();
	},
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

function lockBodyScroll(locked) {
	document.documentElement.style.overflow = locked ? "hidden" : "";
	document.body.style.overflow = locked ? "hidden" : "";
}

function trapFocus(e) {
	if (e.key !== "Tab" || !drawerRef.value) return;
	const focusables = drawerRef.value.querySelectorAll(focusableSelector);
	if (!focusables.length) return;

	const first = focusables[0];
	const last = focusables[focusables.length - 1];

	if (e.shiftKey && document.activeElement === first) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && document.activeElement === last) {
		e.preventDefault();
		first.focus();
	}
}

function handleDocumentKeydown(e) {
	if (!props.isOpen) return;
	if (e.key === "Escape") {
		e.preventDefault();
		emit("close");
		return;
	}
	trapFocus(e);
}

// Derived Categories based on data or static list
const categories = [
	{ id: "ALL", label: t("categories.all") },
	{ id: "Food", label: t("categories.food") },
	{ id: "Fashion", label: t("categories.fashion") },
	{ id: "Beauty", label: t("categories.beauty") },
	{ id: "Tech", label: t("categories.tech") },
	{ id: "Cinema", label: t("categories.cinema") },
];

// Computed Filtered Shops
const filteredShops = computed(() => {
	let result = props.shops;
	// 1. Filter by Floor if in Mall mode (Priority)
	if (activeFloor.value) {
		result = result.filter((s) => {
			if (!s.Floor) return true; // Show shops with no floor? Or maybe hide? Let's show for now to be safe
			return (
				String(s.Floor).trim().toUpperCase() ===
				String(activeFloor.value).trim().toUpperCase()
			);
		});
	}

	// 2. Filter by Tab
	if (activeTab.value !== "ALL") {
		const tab = activeTab.value;
		result = result.filter((s) => {
			const cat = (s.category || "").toLowerCase();
			if (tab === "Food")
				return (
					cat.includes("food") ||
					cat.includes("restaurant") ||
					cat.includes("cafe") ||
					cat.includes("bar") ||
					cat.includes("กิน")
				);
			if (tab === "Fashion")
				return (
					cat.includes("fashion") ||
					cat.includes("clothing") ||
					cat.includes("bag") ||
					cat.includes("แต่งตัว")
				);
			if (tab === "Beauty")
				return (
					cat.includes("beauty") ||
					cat.includes("jewelry") ||
					cat.includes("cosmetic") ||
					cat.includes("ความงาม")
				);
			if (tab === "Tech")
				return (
					cat.includes("tech") ||
					cat.includes("gadget") ||
					cat.includes("mobile") ||
					cat.includes("ไอที")
				);
			if (tab === "Cinema")
				return (
					cat.includes("cinema") ||
					cat.includes("movie") ||
					cat.includes("game") ||
					cat.includes("บันเทิง")
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
				(s.category || "").toLowerCase().includes(q),
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
	const url = `${window.location.href}?shop=${item.id}`;

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
		notifySuccess("Link copied to clipboard!");
	}
};

onUnmounted(() => {
	lockBodyScroll(false);
	document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <transition name="drawer-slide">
    <div
      v-if="isOpen"
      ref="drawerRef"
      class="fixed inset-x-0 bottom-0 h-[85%] flex flex-col rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden"
      :style="{ zIndex: Z.DRAWER }"
      :class="isDarkMode ? 'bg-zinc-900' : 'bg-white'"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="drawerTitleId"
      tabindex="-1"
    >
      <!-- Header Image Area -->
      <div class="relative h-40 sm:h-48 flex-shrink-0">
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
          <div
            class="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent"
          ></div>
        </div>
        <!-- Close Button -->
        <button
          ref="closeButtonRef"
          @click="emit('close')"
          aria-label="Close mall drawer"
          class="absolute top-4 right-4 w-12 h-12 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-colors transition-transform z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Title Info -->
      <div class="absolute bottom-4 left-6 right-6">
        <div class="flex items-center gap-3 mb-1">
          <div
            class="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg"
          >
            <Building2 class="text-white w-6 h-6" />
          </div>
          <div>
            <h2
              :id="drawerTitleId"
              class="text-xl sm:text-2xl font-bold text-white leading-tight shadow-black drop-shadow-md"
            >
              {{ building?.name || "Shopping Mall" }}
            </h2>
            <p class="text-white/70 text-sm">
              {{ building?.zone || "Chiang Mai" }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="absolute bottom-4 right-6 flex gap-2 z-20">
        <button
          @click.stop="
            building && emit('toggle-favorite', building.id || building.key)
          "
          aria-label="Toggle mall favorite"
          class="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-colors transition-transform active:scale-90 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
          :class="[
            building && favorites.includes(Number(building.id || building.key))
              ? 'bg-pink-500 border-pink-400 text-white'
              : 'bg-white/10 border-white/20 text-white hover:bg-white/20',
          ]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            :fill="
              building &&
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
          aria-label="Share mall"
          class="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
        >
          <Share2 class="w-5 h-5 text-white" />
        </button>
      </div>

      <!-- Main Body -->
      <div class="flex-1 flex flex-col overflow-hidden bg-black/5">
        <!-- TOP STATUS ALERT (Phase 6 Enhancement) -->
        <div
          class="flex-shrink-0 px-4 py-2 flex items-center justify-center gap-3 border-b border-white/5"
          :class="isDarkMode ? 'bg-zinc-800' : 'bg-gray-50'"
        >
          <span
            class="px-3 py-1 rounded-full text-white text-[11px] font-black uppercase tracking-widest shadow-lg"
            :class="
              isBuildingOpen ? 'bg-green-600 animate-pulse' : 'bg-red-600'
            "
          >
            {{ isBuildingOpen ? t("status.open") : t("status.closed") }}
          </span>
          <span
            class="text-[11px] font-black opacity-60 uppercase"
            :class="isDarkMode ? 'text-white' : 'text-black'"
          >
            {{ building?.openTime || "10:00" }} -
            {{ building?.closeTime || "22:00" }}
          </span>
        </div>

        <!-- Sticky Tools: Tabs & Search (Topmost below Status) -->
        <div
          class="flex-shrink-0 px-4 py-3 border-b flex items-center gap-2 z-30"
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
                :class="[
                  'px-4 py-2 rounded-xl text-xs font-black transition-colors transition-transform whitespace-nowrap active:scale-95 border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
                  activeTab === cat.id
                    ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/20'
                    : isDarkMode
                      ? 'bg-zinc-800 border-white/20 text-white'
                      : 'bg-white border-gray-300 text-black',
                ]"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Small Magnifying Glass Button -->
            <button
              @click="handleExpandSearch"
              aria-label="Expand search"
              class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              :class="
                isDarkMode
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              "
            >
              <Search class="w-4 h-4" />
            </button>
          </div>

          <!-- Mode 2: Expanded Search Input -->
          <div v-else class="flex-1 flex items-center gap-2 animate-fade-in">
            <div class="relative flex-1">
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                aria-label="Search venues"
                :placeholder="t('mall.search')"
                class="w-full pl-10 pr-4 py-2 rounded-xl text-sm transition-colors outline-none"
                :class="
                  isDarkMode
                    ? 'bg-black/30 text-white placeholder-white/30 border border-white/10 focus:border-blue-500/50'
                    : 'bg-gray-50 text-gray-900 border border-gray-200 focus:border-blue-500'
                "
                @blur="!searchQuery && (isSearchExpanded = false)"
              />
              <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              />
            </div>
            <!-- Cancel Button -->
            <button
              @click="handleClearSearch"
              class="text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 rounded-md px-1"
              :class="
                isDarkMode
                  ? 'text-white font-black hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
              "
            >
              ยกเลิก
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto no-scrollbar relative">
          <!-- 🏢 MALL MODE: Floor Plan & Floor Selector -->
          <div
            v-if="building?.floors?.length"
            class="px-4 py-6 border-b border-white/5 space-y-6"
          >
            <!-- Floor Selector -->
            <div>
              <h3
                class="text-xs font-black text-white/40 uppercase tracking-widest mb-3 px-1"
              >
                {{ t("mall.select_floor") }}
              </h3>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="fl in building.floors"
                  :key="fl"
                  @click="activeFloor = fl"
                  class="px-4 py-2 rounded-xl text-sm font-black transition-colors transition-transform active:scale-90 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                  :class="[
                    activeFloor === fl
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                      : isDarkMode
                        ? 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                  ]"
                >
                  {{ fl }}
                </button>
              </div>
            </div>

            <!-- Floor Name & Description -->
            <div
              v-if="activeFloor && building.floorNames?.[activeFloor]"
              class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl"
            >
              <h4
                class="text-blue-400 text-xs font-black uppercase tracking-tighter mb-1"
              >
                {{ t("mall.current_floor") }}
              </h4>
              <div class="text-white font-black text-xl leading-tight">
                {{ activeFloor }}: {{ building.floorNames[activeFloor] }}
              </div>
            </div>

            <!-- Floor Plan Image -->
            <div
              v-if="activeFloor && building.floorPlanUrls?.[activeFloor]"
              class="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl group"
            >
              <img
                :src="building.floorPlanUrls[activeFloor]"
                class="w-full aspect-video object-contain p-4 transition-transform duration-700 group-hover:scale-110"
              />
              <div
                class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"
              ></div>
              <div class="absolute bottom-4 left-4 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                <span
                  class="text-[10px] font-black text-white uppercase tracking-widest"
                  >{{ t("mall.interactive_map") }}</span
                >
              </div>
            </div>
          </div>

          <!-- 🏮 EVENT CONTENT (Show only if isEvent or specific highlights exist) -->
          <div
            v-if="building?.isEvent || building?.highlights?.length"
            class="px-4 py-6 space-y-8"
          >
            <!-- Highlights Section -->
            <div>
              <h3
                class="text-lg font-black mb-3 italic uppercase tracking-tighter"
                :class="isDarkMode ? 'text-white' : 'text-gray-900'"
              >
                {{ t("mall.highlights") }}
              </h3>
              <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                <div
                  v-for="(hl, idx) in building.highlights || []"
                  :key="idx"
                  class="flex-shrink-0 w-64 h-36 rounded-xl overflow-hidden relative shadow-md bg-gray-800"
                >
                  <img :src="hl.src" class="w-full h-full object-cover" />
                </div>
              </div>
              <p
                class="text-sm opacity-80 mt-2 leading-relaxed font-medium"
                :class="isDarkMode ? 'text-gray-300' : 'text-gray-600'"
              >
                {{ building.description }}
              </p>
            </div>

            <!-- CTA Buttons -->
            <div class="flex flex-col gap-3">
              <button
                class="w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase shadow-lg shadow-blue-600/30 active:scale-95 transition-colors transition-transform flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              >
                <span><MapPin class="w-4 h-4 inline-block" /></span>
                {{ t("mall.navigate") }}
              </button>
              <button
                @click="emit('open-ride-modal', building)"
                class="w-full py-4 rounded-2xl bg-white/10 text-white font-black uppercase border border-white/10 hover:bg-white/20 active:scale-95 transition-colors transition-transform flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
              >
                <span><Car class="w-4 h-4 inline-block" /></span>
                {{ t("mall.taxi") }}
              </button>
            </div>
          </div>

          <!-- Content List -->
          <div
            ref="scrollContainerRef"
            class="flex-1 overflow-y-auto px-4 py-2 space-y-3 pb-safe-offset"
          >
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
              :ref="
                (el) => {
                  if (el) shopRefs[shop.id] = el;
                }
              "
              @click="emit('select-shop', shop)"
              @keydown.enter.prevent="emit('select-shop', shop)"
              @keydown.space.prevent="emit('select-shop', shop)"
              class="flex items-center gap-3 p-3 rounded-2xl transition-colors transition-transform cursor-pointer group active:scale-[0.98] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              role="button"
              tabindex="0"
              :aria-label="`Open ${shop.name || 'venue'} details`"
              :class="[
                isDarkMode
                  ? 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10'
                  : 'bg-white hover:bg-gray-50 border-gray-100 shadow-sm',
                isSelectedShop(shop.id)
                  ? 'ring-2 ring-blue-500 scale-[1.02] border-blue-500/50'
                  : '',
              ]"
            >
              <!-- Image -->
              <div
                class="w-16 h-16 rounded-xl overflow-hidden relative flex-shrink-0 bg-gray-500"
              >
                <img
                  v-if="getShopImage(shop)"
                  :src="getShopImage(shop)"
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
                  :class="[
                    'text-sm font-black truncate uppercase',
                    isDarkMode ? 'text-white' : 'text-black',
                  ]"
                >
                  {{ shop.name }}
                </h3>
                <p
                  :class="[
                    'text-[10px] uppercase font-black tracking-tight',
                    isDarkMode ? 'text-white' : 'text-black',
                  ]"
                >
                  {{ shop.category || "Venue" }}
                </p>
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
                  :aria-label="`Toggle favorite for ${shop.name || 'venue'}`"
                   class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
                   :class="[
                     isFavorited(shop.id)
                       ? 'text-pink-500 bg-pink-500/10'
                       : 'text-gray-400 hover:text-pink-400 hover:bg-pink-400/5',
                   ]"
                 >
                   <Heart
                     class="w-4 h-4"
                     :class="
                       isFavorited(shop.id) ? 'fill-current' : ''
                     "
                   />
                 </button>
                <!-- Share -->
                <button
                  @click.stop="handleShare(shop)"
                  :aria-label="`Share ${shop.name || 'venue'}`"
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-400/5 transition-colors transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                >
                  <Share2 class="w-4 h-4" />
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
    </div>
  </transition>

  <!-- Backgroun Overlay -->
  <transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm"
      :style="{ zIndex: Z.DRAWER_BACKDROP }"
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

@media (prefers-reduced-motion: reduce) {
  .drawer-slide-enter-active,
  .drawer-slide-leave-active,
  .fade-enter-active,
  .fade-leave-active {
    transition-duration: 0.01ms !important;
  }
  * {
    scroll-behavior: auto !important;
  }
}
</style>
