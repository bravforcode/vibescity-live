<script setup>
import { useHaptics } from "@/composables/useHaptics";
import {
  CalendarDays,
  ChevronRight,
  Coffee,
  Crown,
  Gift,
  Handshake,
  Heart,
  LogOut,
  Music,
  Settings,
  ShoppingBag,
  Star,
  Volume2,
  VolumeX,
} from "lucide-vue-next";
import { computed, ref } from "vue"; // ✅ Added computed
import { useI18n } from "vue-i18n"; // ✅ Added i18n

import LanguageToggle from "./LanguageToggle.vue"; // ✅ Reusing LanguageToggle component
import SettingsPanel from "./SettingsPanel.vue"; // ✅ New Settings Panel
import SOSPanel from "./SOSPanel.vue";

const { t } = useI18n(); // ✅ Hook

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  userStats: {
    type: Object,
    default: () => ({
      name: "Explorer",
      level: 1,
      coins: 0,
      avatar: null,
    }),
  },
  isMuted: {
    type: Boolean,
    default: false,
  },
  currentLanguage: {
    type: String,
    default: "en",
  },
  showPartnerProgram: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "close",
  "navigate",
  "toggle-mute",
  "toggle-language",
  "open-merchant",
  "open-sos",
  "take-me-home",
  "open-dashboard",
  "open-partner",
  "open-daily-checkin",
  "open-lucky-wheel",
  "logout",
]);
const { selectFeedback, successFeedback } = useHaptics();

// ✅ Computed Navigation Items for Reactivity
const menuItems = computed(() => [
  {
    id: "favorites",
    label: t("menu.favorites") || "My Favorites",
    icon: Heart,
    color: "bg-pink-600",
  },
  {
    id: "nightlife",
    label: t("menu.nightlife") || "Nightlife",
    icon: Music,
    color: "bg-purple-500",
  },
  {
    id: "cafe",
    label: t("menu.cafe") || "Cafe & Bistro",
    icon: Coffee,
    color: "bg-orange-400",
  },
  {
    id: "fashion",
    label: t("menu.fashion") || "Fashion",
    icon: ShoppingBag,
    color: "bg-pink-500",
  },
  {
    id: "events",
    label: t("menu.events") || "Events",
    icon: Star,
    color: "bg-yellow-400",
  },
]);

// SOS & Settings State
const showSOSPanel = ref(false);
const showSettingsPanel = ref(false);

const handleSOS = () => {
  selectFeedback();
  showSOSPanel.value = true;
  emit("open-sos");
};

const handleTakeMeHome = () => {
  successFeedback();
  emit("take-me-home");
  emit("close");
};

const handleClose = () => {
  selectFeedback();
  emit("close");
};

const handleNavigate = (id) => {
  successFeedback();
  emit("navigate", id);
  emit("close");
};
</script>

<template>
  <div class="relative z-[6000] pointer-events-none">
    <!-- Backdrop -->
    <Transition name="drawer-backdrop">
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        @click="emit('close')"
      />
    </Transition>

    <!-- Drawer Panel -->
    <Transition name="drawer-panel">
      <div
        v-if="isOpen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-title"
        class="fixed inset-y-0 left-0 w-[280px] bg-zinc-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl flex flex-col pt-safe-top pb-safe-bottom pointer-events-auto"
      >
        <!-- Header -->
        <div
          class="p-6 flex items-center justify-between border-b border-white/5"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[1px]"
            >
              <img
                v-if="userStats.avatar"
                :src="userStats.avatar"
                alt="User"
                class="w-full h-full rounded-full object-cover border-2 border-black"
              />
              <div
                v-else
                class="w-full h-full rounded-full bg-black flex items-center justify-center text-white font-bold"
              >
                {{ userStats.name.charAt(0) }}
              </div>
            </div>
            <div>
              <h3
                id="sidebar-title"
                class="text-sm font-bold text-white leading-tight"
              >
                {{ userStats.name }}
              </h3>
              <p class="text-[10px] text-white/50">
                Lvl {{ userStats.level }} • {{ userStats.coins }} Coins
              </p>
            </div>
          </div>
          <button
            @click="emit('close')"
            aria-label="Close sidebar"
            class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-[color,background-color,border-color,transform]"
          >
            <ChevronRight class="w-4 h-4 rotate-180" />
          </button>
        </div>

        <!-- Scrollable Menu -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Rewards -->
          <div class="space-y-2">
            <h4
              class="text-[10px] font-black text-white/30 uppercase tracking-widest px-2"
            >
              Rewards
            </h4>
            <button
              type="button"
              aria-label="Open daily check-in rewards"
              @click="
                successFeedback();
                emit('open-daily-checkin');
                emit('close');
              "
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-purple-700/40 to-fuchsia-700/40 hover:from-purple-700/60 hover:to-fuchsia-700/60 text-white border border-purple-400/30 shadow-lg transition-[color,background-color,border-color,transform] active:scale-95"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center"
                >
                  <CalendarDays class="w-4 h-4 text-white" />
                </div>
                <div class="text-left">
                  <div class="text-sm font-black text-white">
                    Daily Check-in
                  </div>
                  <div class="text-[10px] text-purple-200">
                    Claim streak rewards
                  </div>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-white/40" />
            </button>

            <button
              type="button"
              aria-label="Open lucky wheel rewards"
              @click="
                successFeedback();
                emit('open-lucky-wheel');
                emit('close');
              "
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-600/40 to-orange-600/40 hover:from-amber-600/60 hover:to-orange-600/60 text-white border border-amber-400/30 shadow-lg transition-[color,background-color,border-color,transform] active:scale-95"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center"
                >
                  <Gift class="w-4 h-4 text-white" />
                </div>
                <div class="text-left">
                  <div class="text-sm font-black text-white">Lucky Wheel</div>
                  <div class="text-[10px] text-amber-200">
                    Spin for bonus prizes
                  </div>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-white/40" />
            </button>
          </div>

          <!-- Main Navigation -->
          <div class="space-y-2">
            <h4
              class="text-[10px] font-black text-white/30 uppercase tracking-widest px-2"
            >
              Discover
            </h4>
            <button
              v-for="item in menuItems"
              :key="item.id"
              @click="handleNavigate(item.id)"
              :aria-label="item.label"
              class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 active:scale-95 transition-[color,background-color,border-color,transform] group"
            >
              <div
                :class="[
                  'w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform',
                  item.color,
                ]"
              >
                <component :is="item.icon" class="w-4 h-4" />
              </div>
              <span
                class="text-sm font-bold text-white/90 group-hover:text-white"
                >{{ item.label }}</span
              >
            </button>
          </div>

          <!-- System Settings -->
          <div class="space-y-2">
            <h4
              class="text-[10px] font-black text-white/30 uppercase tracking-widest px-2"
            >
              System
            </h4>

            <!-- Sound Toggle -->
            <button
              @click="
                emit('toggle-mute');
                selectFeedback();
              "
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-[color,background-color,border-color,transform] text-white border border-white/5"
            >
              <div class="flex items-center gap-3">
                <VolumeX v-if="isMuted" class="w-4 h-4 text-white/50" />
                <Volume2 v-else class="w-4 h-4 text-blue-400" />
                <span class="text-sm font-medium">{{
                  isMuted
                    ? t("menu.sound_off") || "Sound Off"
                    : t("menu.sound_on") || "Sound On"
                }}</span>
              </div>
              <div
                :class="[
                  'w-10 h-5 rounded-full transition-colors',
                  isMuted ? 'bg-white/20' : 'bg-blue-500',
                ]"
              >
                <div
                  :class="[
                    'w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5',
                    isMuted ? 'ml-0.5' : 'ml-5',
                  ]"
                ></div>
              </div>
            </button>

            <!-- Language Toggle (Component) -->
            <div class="px-1">
              <LanguageToggle class="w-full justify-between" />
            </div>

            <button
              @click="showSettingsPanel = true"
              aria-label="Open settings panel"
              data-testid="sidebar-open-settings"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-[color,background-color,border-color,transform] text-white border border-white/5"
            >
              <div class="flex items-center gap-3">
                <Settings class="w-4 h-4 text-white/70" />
                <span class="text-sm font-medium">Settings</span>
              </div>
              <ChevronRight class="w-4 h-4 text-white/30" />
            </button>

            <!-- Merchant Zone -->
            <button
              @click="$emit('open-merchant')"
              aria-label="Open merchant promotion"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-900/40 to-purple-900/40 hover:from-blue-900/60 transition-[color,background-color,border-color,transform] text-white border border-blue-500/30 mb-2 shadow-lg group"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform"
                >
                  <span class="text-sm">📢</span>
                </div>
                <div class="text-left">
                  <div class="text-sm font-black text-white">Promote Shop</div>
                  <div class="text-[10px] text-blue-200">
                    Get more customers
                  </div>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-white/30" />
            </button>

            <!-- Owner Dashboard Button -->
            <button
              @click="$emit('open-dashboard')"
              aria-label="Open owner dashboard"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-600/40 to-orange-600/40 hover:from-amber-600/60 transition-[color,background-color,border-color,transform] text-white border border-amber-500/30 mb-2 shadow-lg group"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform"
                >
                  <Crown class="w-4 h-4 text-white" />
                </div>
                <div class="text-left">
                  <div class="text-sm font-black text-white">
                    Owner Dashboard
                  </div>
                  <div class="text-[10px] text-amber-200">
                    Manage / Boost Pin
                  </div>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-white/30" />
            </button>

            <button
              v-if="showPartnerProgram"
              @click="$emit('open-partner')"
              aria-label="Open partner dashboard"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-cyan-600/40 to-blue-700/40 hover:from-cyan-600/60 transition-[color,background-color,border-color,transform] text-white border border-cyan-400/30 mb-2 shadow-lg group"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center group-hover:scale-110 transition-transform"
                >
                  <Handshake class="w-4 h-4 text-black" />
                </div>
                <div class="text-left">
                  <div class="text-sm font-black text-white">
                    Partner Program
                  </div>
                  <div class="text-[10px] text-cyan-200">
                    Referral + payout dashboard
                  </div>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-white/30" />
            </button>

            <button
              @click="
                successFeedback();
                emit('logout');
                emit('close');
              "
              aria-label="Logout"
              data-testid="sidebar-logout"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 active:scale-95 transition-[color,background-color,border-color,transform] text-red-500 hover:bg-red-500/10 border border-white/5"
            >
              <div class="flex items-center gap-3">
                <LogOut class="w-4 h-4" />
                <span class="text-sm font-medium">Log Out</span>
              </div>
            </button>
          </div>
        </div>

        <!-- ✅ Extracted SOS Panel & Settings Overlay -->
        <SOSPanel :isOpen="showSOSPanel" @close="showSOSPanel = false" />
        <SettingsPanel
          :isOpen="showSettingsPanel"
          @close="showSettingsPanel = false"
        />

        <!-- Footer -->
        <div class="p-6 text-center">
          <p class="text-[10px] text-white/20 font-mono">
            VibeCity v2.0.0 (Hardened)
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pt-safe-top {
  padding-top: env(safe-area-inset-top, 24px);
}
.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 20px);
}

/* ═══════════════════════════════════════════════════════════════
   🎬 PREMIUM DRAWER ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

.drawer-backdrop-enter-active {
  animation: backdropIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.drawer-backdrop-leave-active {
  animation: backdropOut 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

@keyframes backdropIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(12px);
  }
}

@keyframes backdropOut {
  from {
    opacity: 1;
    backdrop-filter: blur(12px);
  }
  to {
    opacity: 0;
    backdrop-filter: blur(0);
  }
}

.drawer-panel-enter-active {
  animation: drawerSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.drawer-panel-leave-active {
  animation: drawerSlideOut 0.35s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

@keyframes drawerSlideIn {
  from {
    transform: translateX(-100%);
    opacity: 0.5;
    filter: blur(4px);
  }
  to {
    transform: translateX(0);
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes drawerSlideOut {
  from {
    transform: translateX(0);
    opacity: 1;
    filter: blur(0);
  }
  to {
    transform: translateX(-100%);
    opacity: 0.5;
    filter: blur(4px);
  }
}

/* Optimized CSS-only Shine */
.shine-effect {
  position: absolute;
  top: 0;
  left: -100%; /* Start off-screen */
  width: 50%;
  height: 100%;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transform: skewX(-20deg);
  animation: shine 4s infinite ease-in-out;
  pointer-events: none;
}

@keyframes shine {
  0%,
  80% {
    left: -100%;
  }
  100% {
    left: 200%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer-backdrop-enter-active,
  .drawer-backdrop-leave-active,
  .drawer-panel-enter-active,
  .drawer-panel-leave-active,
  .shine-effect {
    animation: none !important;
  }
}
</style>
