// --- C:\vibecity.live\src\components\modal\ProfileDrawer.vue ---

<script setup>
import { computed, defineAsyncComponent } from "vue";

const AchievementBadges = defineAsyncComponent(
	() => import("../ui/AchievementBadges.vue"),
);

import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { Z } from "../../constants/zIndex";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
	isOpen: Boolean,
	isDarkMode: Boolean,
});

const emit = defineEmits(["close", "toggle-language"]);

const { t, locale } = useI18n();
const shopStore = useShopStore();
const { userLevel, totalCoins, nextLevelXP, levelProgress } =
	storeToRefs(shopStore);

const currentXP = computed(() =>
	Math.floor(levelProgress.value * nextLevelXP.value),
);

const handleBackdropClick = () => {
	emit("close");
};
</script>

<template>
  <transition name="drawer-slide">
    <div
      v-if="isOpen"
      class="fixed inset-y-0 right-0 w-full max-w-sm flex flex-col"
      :style="{ zIndex: Z.DRAWER }"

    >
      <div
        :class="[
          'h-full flex flex-col shadow-2xl overflow-hidden',
          isDarkMode
            ? 'bg-zinc-950 border-l border-white/10'
            : 'bg-white border-l border-gray-100',
        ]"
      >
        <!-- Header -->
        <div class="px-6 pt-8 pb-6 flex items-center justify-between">
          <h2
            :class="[
              'text-2xl font-black uppercase tracking-tighter',
              isDarkMode ? 'text-white' : 'text-black',
            ]"
          >
            Profile
          </h2>
          <button
            @click="emit('close')"
            class="w-10 h-10 rounded-full flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors"
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
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto px-6 space-y-8 pb-32">
          <!-- Level Stats Card -->
          <div
            :class="[
              'p-6 rounded-3xl border shadow-xl relative overflow-hidden',
              isDarkMode
                ? 'bg-zinc-900 border-white/10'
                : 'bg-gray-50 border-gray-200',
            ]"
          >
            <div class="relative z-10">
              <div class="flex items-center justify-between mb-4">
                <span
                  class="text-xs font-black uppercase tracking-widest opacity-40"
                  >Rank & Level</span
                >
                <div
                  class="px-3 py-1 rounded-full bg-blue-600/20 text-blue-500 text-[10px] font-black uppercase"
                >
                  Explorer
                </div>
              </div>

              <div class="flex items-end gap-3 mb-6">
                <span
                  class="text-5xl font-black italic tracking-tighter text-blue-600"
                  >LV{{ userLevel }}</span
                >
                <span class="text-sm font-bold opacity-40 pb-1">Mastery</span>
              </div>

              <!-- XP Progress -->
              <div class="space-y-2">
                <div
                  class="flex justify-between text-[10px] font-black uppercase opacity-60"
                >
                  <span>{{
                    t("nav.xp", { current: currentXP, next: nextLevelXP })
                  }}</span>
                  <span>{{ Math.floor(levelProgress * 100) }}%</span>
                </div>
                <div
                  class="h-3 w-full bg-black/10 rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-1000"
                    :style="{ width: `${levelProgress * 100}%` }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Decoration -->
            <div
              class="absolute -right-4 -bottom-4 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full"
            ></div>
          </div>

          <!-- Achievements Section (Phase 5 Integrated) -->
          <div class="space-y-4">
            <h3
              :class="[
                'text-xs font-black uppercase tracking-widest opacity-40',
                isDarkMode ? 'text-white' : 'text-black',
              ]"
            >
              Unlocked Badges
            </h3>
            <AchievementBadges />
          </div>

          <!-- Currency Section -->
          <div class="grid grid-cols-2 gap-4">
            <div
              :class="[
                'p-5 rounded-3xl border',
                isDarkMode
                  ? 'bg-zinc-900 border-white/10'
                  : 'bg-gray-100 border-gray-200',
              ]"
            >
              <div class="text-xs font-black uppercase opacity-40 mb-1">
                Total Coins
              </div>
              <div class="text-2xl font-black text-yellow-500">
                {{ totalCoins }}
              </div>
            </div>
            <div
              :class="[
                'p-5 rounded-3xl border',
                isDarkMode
                  ? 'bg-zinc-900 border-white/10'
                  : 'bg-gray-100 border-gray-200',
              ]"
            >
              <div class="text-xs font-black uppercase opacity-40 mb-1">
                Coupons
              </div>
              <div class="text-2xl font-black text-emerald-500">0</div>
            </div>
          </div>

          <!-- Settings Section -->
          <div class="space-y-4">
            <h3
              :class="[
                'text-xs font-black uppercase tracking-widest opacity-40',
                isDarkMode ? 'text-white' : 'text-black',
              ]"
            >
              Settings & Account
            </h3>

            <!-- Language Toggle Button -->
            <button
              @click="emit('toggle-language')"
              :class="[
                'w-full flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98]',
                isDarkMode
                  ? 'bg-white/5 border-white/10'
                  : 'bg-black/5 border-black/5',
              ]"
            >
              <div class="flex items-center gap-3">
                <span class="text-lg">🌐</span>
                <span class="text-sm font-bold">Language / ภาษา</span>
              </div>
              <span
                class="text-xs font-black bg-blue-600 text-white px-2 py-1 rounded-lg uppercase"
              >
                {{ locale === "th" ? "Thai" : "English" }}
              </span>
            </button>

            <!-- Placeholder for other settings -->
            <div
              :class="[
                'w-full flex items-center gap-3 p-4 rounded-2xl border opacity-50',
                isDarkMode
                  ? 'bg-white/5 border-white/10'
                  : 'bg-black/5 border-black/5',
              ]"
            >
              <span class="text-lg">🔔</span>
              <span class="text-sm font-bold">Notifications</span>
            </div>
            <div
              :class="[
                'w-full flex items-center gap-3 p-4 rounded-2xl border opacity-50',
                isDarkMode
                  ? 'bg-white/5 border-white/10'
                  : 'bg-black/5 border-black/5',
              ]"
            >
              <span class="text-lg">👤</span>
              <span class="text-sm font-bold">Account Details</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-black/5">
          <p
            class="text-[10px] text-center font-black uppercase opacity-30 italic"
          >
            VibeCity v1.0.0 Enterprise MVP
          </p>
        </div>
      </div>
    </div>
  </transition>

  <!-- Backdrop -->
  <transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm"
      :style="{ zIndex: Z.DRAWER_BACKDROP }"
      @click="handleBackdropClick"
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
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
