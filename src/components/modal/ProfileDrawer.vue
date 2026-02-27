<script setup>
/**
 * ProfileDrawer.vue - God Tier Edition (Loki Mode)
 * Premium Sidebar Hub with Real-Time Gamification Data
 */

import {
	ChevronLeft,
	ChevronRight,
	HelpCircle,
	History,
	LogOut,
	Settings,
	ShoppingBag,
	Trophy,
	User,
	X,
	Zap,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onUnmounted,
	ref,
	watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useHaptics } from "../../composables/useHaptics";
import { Z } from "../../constants/zIndex";
import { paymentService } from "../../services/paymentService";
import { useCoinStore } from "../../store/coinStore";
import { useUserStore } from "../../store/userStore";

// Async Components
const AchievementBadges = defineAsyncComponent(
	() => import("../ui/AchievementBadges.vue"),
);

const props = defineProps({
	isOpen: Boolean,
	isDarkMode: Boolean,
});

const emit = defineEmits(["close", "toggle-language"]);

const { t, locale } = useI18n();
const { selectFeedback } = useHaptics();

// ✅ Store Integration
const coinStore = useCoinStore();
const userStore = useUserStore();

// Destructure reactive state
const { coins, currentLevel, levelProgress, xpToNextLevel } =
	storeToRefs(coinStore);
const { profile } = storeToRefs(userStore);

// Computed Display
const userLevel = computed(() => currentLevel.value.level);
const levelTitle = computed(() => currentLevel.value.title);
const totalCoins = computed(() => coins.value);
const progressPercent = computed(() => Math.floor(levelProgress.value * 100));
const displayName = computed(() => {
	const name = String(profile.value?.displayName || "").trim();
	return name || "Vibe Explorer";
});

// Status map for order statuses
const statusMap = {
	pending_review: "status.pendingReview",
	paid: "status.completed",
	rejected: "status.rejected",
};

// View State
const activeView = ref("menu"); // 'menu' | 'orders'
const myOrders = ref([]);
const loadingOrders = ref(false);
const drawerRef = ref(null);
const closeButtonRef = ref(null);
const comingSoonToast = ref(false);
let comingSoonTimer = null;
const isDev = import.meta.env.DEV;
const appVersion = import.meta.env.VITE_APP_VERSION || "dev";

const drawerTitleId = "profile-drawer-title";
const focusableSelector =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
let previousFocusedElement = null;

const handleClose = () => {
	selectFeedback();
	activeView.value = "menu"; // Reset
	emit("close");
};

const handleLogout = async () => {
	selectFeedback();
	await userStore.logout();
	emit("close");
};

const fetchOrders = async () => {
	if (!userStore.isAuthenticated) {
		myOrders.value = [];
		return;
	}
	loadingOrders.value = true;
	try {
		myOrders.value = await paymentService.getMyOrders();
	} catch (error) {
		console.error("Error fetching orders:", error);
		myOrders.value = [];
	} finally {
		loadingOrders.value = false;
	}
};

const showComingSoon = () => {
	comingSoonToast.value = true;
	clearTimeout(comingSoonTimer);
	comingSoonTimer = setTimeout(() => {
		comingSoonToast.value = false;
	}, 2000);
};

const handleMenuItemClick = (item) => {
	selectFeedback();
	if (item.id === "orders") {
		if (!userStore.isAuthenticated) {
			showComingSoon();
			return;
		}
		activeView.value = "orders";
		fetchOrders();
	} else {
		showComingSoon();
	}
};

const lockBodyScroll = (locked) => {
	document.documentElement.style.overflow = locked ? "hidden" : "";
	document.body.style.overflow = locked ? "hidden" : "";
};

const trapFocus = (e) => {
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
};

const handleDocumentKeydown = (e) => {
	if (!props.isOpen) return;
	if (e.key === "Escape") {
		e.preventDefault();
		handleClose();
		return;
	}
	trapFocus(e);
};

watch(
	() => props.isOpen,
	(isOpen) => {
		if (isOpen) {
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

onUnmounted(() => {
	lockBodyScroll(false);
	document.removeEventListener("keydown", handleDocumentKeydown);
	clearTimeout(comingSoonTimer);
});

const menuSections = computed(() => {
	const accountItems = [];
	if (userStore.isAuthenticated) {
		accountItems.push({
			id: "orders",
			label: t("profile.my_orders"),
			icon: ShoppingBag,
			color: "text-green-400",
		});
	}
	accountItems.push(
		{
			id: "profile",
			label: t("profile.edit_profile"),
			icon: User,
			color: "text-zinc-400",
		},
		{
			id: "settings",
			label: t("profile.preferences"),
			icon: Settings,
			color: "text-zinc-400",
		},
		{
			id: "support",
			label: t("profile.help_support"),
			icon: HelpCircle,
			color: "text-zinc-400",
		},
	);

	return [
		{
			title: t("profile.vibe_discovery"),
			items: [
				{
					id: "events",
					label: t("profile.nearby_events"),
					icon: Zap,
					color: "text-amber-400",
				},
				{
					id: "quests",
					label: t("profile.vibe_quests"),
					icon: Trophy,
					color: "text-purple-400",
				},
				{
					id: "history",
					label: t("profile.visit_history"),
					icon: History,
					color: "text-blue-400",
				},
			],
		},
		{
			title: t("profile.account"),
			items: accountItems,
		},
	];
});
</script>

<template>
  <transition name="drawer-slide">
    <div
      v-if="isOpen"
      ref="drawerRef"
      class="fixed inset-y-0 right-0 w-[85%] max-w-[320px] flex flex-col"
      :style="{ zIndex: Z.DRAWER }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="drawerTitleId"
      tabindex="-1"
    >
      <div
        :class="[
          'h-full flex flex-col shadow-2xl overflow-hidden backdrop-blur-3xl',
          'bg-zinc-900/90 border-l border-white/10',
        ]"
      >
        <button
          ref="closeButtonRef"
          type="button"
          class="absolute top-4 left-4 z-30 w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center transition-colors transition-transform hover:bg-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          aria-label="Close profile drawer"
          @click="handleClose"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- ✅ 1. Glass Stats Card (The "Wow" Factor) -->
        <div class="relative px-5 pt-12 pb-8 overflow-hidden">
          <!-- Background Glows -->
          <div
            class="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/30 blur-[60px] rounded-full animate-pulse-slow"
          ></div>
          <div
            class="absolute top-20 -left-10 w-24 h-24 bg-purple-600/20 blur-[40px] rounded-full animate-pulse-slow delay-700"
          ></div>

          <div class="relative z-10 flex flex-col items-center">
            <!-- Avatar Ring -->
            <div
              class="relative mb-4 group cursor-pointer active:scale-95 transition-transform"
            >
              <div
                class="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-blue-500 to-purple-600 p-1 shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500"
              >
                <div
                  class="w-full h-full rounded-[1.8rem] bg-zinc-900 overflow-hidden border-2 border-white/20 relative"
                >
                  <img
                    :src="
                      profile?.avatar || '/images/default-avatar.svg'
                    "
                    alt="Avatar"
                    class="w-full h-full object-cover scale-110"
                  />
                </div>
              </div>
              <div
                class="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-zinc-950 border border-white/20 flex items-center justify-center shadow-xl"
              >
                <span class="text-sm">👑</span>
              </div>
            </div>

            <!-- User Info -->
            <h2
              :id="drawerTitleId"
              class="text-xl font-black text-white tracking-tight uppercase drop-shadow-md"
            >
              {{ displayName }}
            </h2>
            <div class="flex items-center gap-2 mt-1">
              <span
                class="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-[10px] font-bold text-blue-300 uppercase tracking-widest backdrop-blur-sm"
              >
                {{ levelTitle }}
              </span>
              <span
                class="text-[10px] font-bold text-white/40 uppercase tracking-widest"
              >
                LV.{{ userLevel }}
              </span>
            </div>

            <!-- Stats Row -->
            <div class="flex gap-2 mt-6 w-full">
              <div
                class="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col items-center shadow-inner group hover:bg-white/10 transition-colors"
              >
                <span
                  class="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1 group-hover:text-white/50 transition-colors"
                  >{{ t("profile.total_coins") }}</span
                >
                <span class="text-lg font-black text-yellow-400 drop-shadow-sm"
                  >🪙 {{ totalCoins.toLocaleString() }}</span
                >
              </div>
              <div
                class="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col items-center shadow-inner group hover:bg-white/10 transition-colors"
              >
                <span
                  class="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1 group-hover:text-white/50 transition-colors"
                  >{{ t("profile.next_level") }}</span
                >
                <div class="flex flex-col items-center w-full px-2">
                  <span class="text-lg font-black text-blue-400 drop-shadow-sm"
                    >{{ progressPercent }}%</span
                  >
                  <div
                    class="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden"
                  >
                    <div
                      class="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      :style="{ width: `${progressPercent}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ✅ 4. My Orders View (Dynamic) -->
        <div
          v-if="activeView === 'orders'"
          class="flex-1 overflow-y-auto px-5 py-4 no-scrollbar space-y-4"
        >
          <div class="flex items-center gap-2 mb-4">
            <button
              @click="activeView = 'menu'"
              class="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              aria-label="Back to menu"
            >
              <ChevronLeft class="w-5 h-5 text-white" />
            </button>
            <h3 class="text-lg font-bold text-white">{{ t("profile.purchase_history") }}</h3>
          </div>

          <div v-if="loadingOrders" class="text-center py-10 text-gray-400">
            {{ t("profile.loading") }}
          </div>
          <div
            v-else-if="myOrders.length === 0"
            class="text-center py-10 text-gray-500"
          >
            <p>{{ t("profile.no_orders") }}</p>
            <button
              @click="emit('close')"
              class="mt-4 text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 rounded-md px-1"
            >
              {{ t("profile.go_buy") }}
            </button>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="order in myOrders"
              :key="order.id"
              class="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div class="font-bold text-white text-md">
                  {{ order.sku.toUpperCase() }}
                </div>
                <div class="text-xs text-gray-400">
                  {{ new Date(order.created_at).toLocaleDateString() }}
                </div>
                <div
                  v-if="order.payment_method === 'manual_transfer'"
                  class="text-[10px] text-gray-500 mt-1"
                >
                  {{ t("profile.ref_manual") }}
                </div>
              </div>
              <div class="text-right">
                <div class="font-bold text-white">฿{{ order.amount }}</div>
                <span
                  class="px-2 py-1 rounded text-[10px] font-bold uppercase"
                  :class="{
                    'bg-yellow-500/20 text-yellow-400':
                      order.status === 'pending_review' ||
                      order.status === 'pending',
                    'bg-green-500/20 text-green-400':
                      order.status === 'paid' || order.status === 'active',
                    'bg-red-500/20 text-red-400': order.status === 'rejected',
                  }"
                >
                  {{ t(statusMap[order.status] || order.status) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ✅ 2. Scrollable Sections (Tiled Iconography) - Main Menu -->
        <div
          v-else
          class="flex-1 overflow-y-auto px-5 py-4 no-scrollbar space-y-8"
        >
          <!-- Badges Section -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3
                class="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]"
              >
                {{ t("profile.achievements") }}
              </h3>
              <button
                type="button"
                class="text-[9px] font-bold text-blue-400 px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20 hover:bg-blue-400/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                @click="showComingSoon"
              >{{ t("profile.view_all") }}</button>
            </div>
            <!-- Pass achievements from store if needed, or keep generic until integrated -->
            <AchievementBadges class="scale-90 origin-left" />
          </div>

          <!-- Dynamic Menu Sections -->
          <div
            v-for="section in menuSections"
            :key="section.title"
            class="space-y-3"
          >
            <h3
              class="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]"
            >
              {{ section.title }}
            </h3>
            <div class="grid grid-cols-1 gap-2">
              <button
                v-for="item in section.items"
                :key="item.id"
                @click="handleMenuItemClick(item)"
                class="group flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] border border-white/[0.05] transition-colors transition-transform duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                :aria-label="item.label"
              >
                <div
                  :class="[
                    'w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95 shadow-inner',
                    item.color,
                  ]"
                >
                  <component :is="item.icon" class="w-5 h-5 shadow-sm" />
                </div>
                <div class="flex-1 text-left">
                  <div
                    class="text-xs font-bold text-white group-hover:text-blue-200 transition-colors"
                  >
                    {{ item.label }}
                    <span v-if="item.id !== 'orders'" class="ml-1 text-[10px]" aria-hidden="true">🔜</span>
                  </div>
                </div>
                <ChevronRight
                  class="w-4 h-4 text-white/10 group-hover:text-white/40 transition-colors"
                />
              </button>
            </div>
          </div>

          <!-- Language Toggle Tile -->
          <div class="space-y-3">
            <h3
              class="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]"
            >
              {{ t("profile.system") }}
            </h3>
            <button
              @click="
                emit('toggle-language');
                selectFeedback();
              "
              class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-colors transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              aria-label="Toggle language"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"
                >
                  <span class="text-sm">🌐</span>
                </div>
                <span class="text-xs font-bold text-white"
                  >{{ t("profile.language") }}</span
                >
              </div>
              <span
                class="text-[9px] font-black bg-blue-600 text-white px-2 py-1 rounded-lg uppercase shadow-lg shadow-blue-500/20"
              >
                {{ locale === "th" ? "TH" : "EN" }}
              </span>
            </button>
          </div>
        </div>

        <!-- ✅ 3. Footer with Premium Brand -->
        <div class="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl">
          <button
            v-if="userStore.isAuthenticated"
            @click="handleLogout"
            class="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-black uppercase tracking-widest active:scale-95 transition-colors transition-transform mb-4 flex items-center justify-center gap-2 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
          >
            <LogOut class="w-4 h-4" />
            {{ t("profile.sign_out") }}
          </button>
          <div class="flex flex-col items-center gap-1 opacity-50">
            <h4
              class="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]"
            >
              {{ t("profile.brand") }}
            </h4>
            <p v-if="isDev" class="text-[7px] text-white/20 font-bold uppercase">
              {{ t("profile.loki_mode") }}
            </p>
            <p class="text-[7px] text-white/20 font-bold uppercase">
              {{ t("profile.version", { version: appVersion }) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Coming Soon Toast -->
  <transition name="fade">
    <div
      v-if="comingSoonToast"
      class="fixed top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-purple-600/90 text-white text-xs font-bold shadow-lg backdrop-blur-sm"
      :style="{ zIndex: Z.SUBMODAL }"
      role="status"
      aria-live="polite"
    >
      🔜 {{ t('profile.coming_soon') }}
    </div>
  </transition>

  <!-- Backdrop -->
  <transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/80 backdrop-blur-md"
      :style="{ zIndex: Z.DRAWER_BACKDROP }"
      @click="handleClose"
    ></div>
  </transition>
</template>

<style scoped>
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
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
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-pulse-slow {
  animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-pulse-slow {
    animation: none !important;
  }
  .drawer-slide-enter-active,
  .drawer-slide-leave-active,
  .fade-enter-active,
  .fade-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
