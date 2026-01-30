// --- C:\vibecity.live\src\components\modal\ProfileDrawer.vue ---

<script setup>
/**
 * ProfileDrawer.vue - Premium Sidebar Hub Redesign
 * Featuring Glassmorphism and Tile Iconography
 */
import { computed, defineAsyncComponent, ref } from "vue";

const AchievementBadges = defineAsyncComponent(
	() => import("../ui/AchievementBadges.vue"),
);

import {
	ChevronRight,
	Gift,
	HelpCircle,
	History,
	LogOut,
	Settings,
	Star,
	Trophy,
	User,
	Zap,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useHaptics } from "../../composables/useHaptics";
import { Z } from "../../constants/zIndex";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
	isOpen: Boolean,
	isDarkMode: Boolean,
});

const emit = defineEmits(["close", "toggle-language"]);

const { t, locale } = useI18n();
const { selectFeedback } = useHaptics();
const shopStore = useShopStore();
const { userLevel, totalCoins, levelProgress } = storeToRefs(shopStore);

const handleClose = () => {
	selectFeedback();
	emit("close");
};

const menuSections = [
	{
		title: "Vibe Discovery",
		items: [
			{
				id: "events",
				label: "Nearby Events",
				icon: Zap,
				color: "text-amber-400",
			},
			{
				id: "quests",
				label: "Vibe Quests",
				icon: Trophy,
				color: "text-purple-400",
			},
			{
				id: "history",
				label: "Visit History",
				icon: History,
				color: "text-blue-400",
			},
		],
	},
	{
		title: "Account",
		items: [
			{
				id: "profile",
				label: "Edit Profile",
				icon: User,
				color: "text-zinc-400",
			},
			{
				id: "settings",
				label: "Preferences",
				icon: Settings,
				color: "text-zinc-400",
			},
			{
				id: "support",
				label: "Help & Support",
				icon: HelpCircle,
				color: "text-zinc-400",
			},
		],
	},
];
</script>

<template>
  <transition name="drawer-slide">
    <div
      v-if="isOpen"
      class="fixed inset-y-0 right-0 w-[85%] max-w-[320px] flex flex-col"
      :style="{ zIndex: Z.DRAWER }"
    >
      <div
        :class="[
          'h-full flex flex-col shadow-2xl overflow-hidden backdrop-blur-3xl',
          isDarkMode
            ? 'bg-zinc-950/90 border-l border-white/10'
            : 'bg-white/95 border-l border-gray-100',
        ]"
      >
        <!-- ✅ 1. Glass Stats Card (The "Wow" Factor) -->
        <div class="relative px-5 pt-12 pb-8 overflow-hidden">
          <!-- Background Glows -->
          <div
            class="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/20 blur-[60px] rounded-full"
          ></div>
          <div
            class="absolute top-20 -left-10 w-24 h-24 bg-purple-600/10 blur-[40px] rounded-full"
          ></div>

          <div class="relative z-10 flex flex-col items-center">
            <!-- Avatar Ring -->
            <div
              class="relative mb-4 group cursor-pointer active:scale-95 transition-transform"
            >
              <div
                class="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-blue-500 to-purple-600 p-1 shadow-2xl rotate-3 group-hover:rotate-0 transition-all duration-500"
              >
                <div
                  class="w-full h-full rounded-[1.8rem] bg-zinc-900 overflow-hidden border-2 border-white/20"
                >
                  <img
                    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vibicity"
                    alt="Avatar"
                    class="w-full h-full scale-110"
                  />
                </div>
              </div>
              <div
                class="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-zinc-950 border border-white/20 flex items-center justify-center shadow-xl"
              >
                <Star class="w-4 h-4 text-yellow-400 fill-current" />
              </div>
            </div>

            <!-- User Info -->
            <h2 class="text-xl font-black text-white tracking-tight uppercase">
              Master LV.{{ userLevel }}
            </h2>
            <p
              class="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1"
            >
              Vibecity Explorer
            </p>

            <!-- Stats Row -->
            <div class="flex gap-2 mt-6 w-full">
              <div
                class="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col items-center shadow-inner"
              >
                <span
                  class="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1"
                  >Total Coins</span
                >
                <span class="text-lg font-black text-yellow-500"
                  >🪙 {{ totalCoins }}</span
                >
              </div>
              <div
                class="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col items-center shadow-inner"
              >
                <span
                  class="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1"
                  >Mastery</span
                >
                <span class="text-lg font-black text-blue-400"
                  >{{ Math.floor(levelProgress * 100) }}%</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- ✅ 2. Scrollable Sections (Tiled Iconography) -->
        <div class="flex-1 overflow-y-auto px-5 py-4 no-scrollbar space-y-8">
          <!-- Badges Section -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3
                class="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]"
              >
                Achievements
              </h3>
              <span
                class="text-[9px] font-bold text-blue-400 px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20"
                >View All</span
              >
            </div>
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
                @click="selectFeedback"
                class="group flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] border border-white/[0.05] transition-all duration-300"
              >
                <div
                  :class="[
                    'w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center transition-all group-hover:scale-110 group-active:scale-95',
                    item.color,
                  ]"
                >
                  <component :is="item.icon" class="w-5 h-5 shadow-sm" />
                </div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-bold text-white">
                    {{ item.label }}
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
              Regional
            </h3>
            <button
              @click="
                emit('toggle-language');
                selectFeedback();
              "
              class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center"
                >
                  <span class="text-sm">🌐</span>
                </div>
                <span class="text-xs font-bold text-white"
                  >Language / ภาษา</span
                >
              </div>
              <span
                class="text-[9px] font-black bg-blue-600 text-white px-2 py-1 rounded-lg uppercase"
              >
                {{ locale === "th" ? "TH" : "EN" }}
              </span>
            </button>
          </div>
        </div>

        <!-- ✅ 3. Footer with Premium Brand -->
        <div class="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl">
          <button
            @click="handleClose"
            class="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-black uppercase tracking-widest active:scale-95 transition-all mb-4 flex items-center justify-center gap-2"
          >
            <LogOut class="w-4 h-4" />
            Sign Out
          </button>
          <div class="flex flex-col items-center gap-1">
            <h4
              class="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]"
            >
              VibeCity Live
            </h4>
            <p class="text-[7px] text-white/10 font-bold uppercase">
              Enterprise Version 2.0.428-A
            </p>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Backdrop with better blur -->
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
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
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
</style>
