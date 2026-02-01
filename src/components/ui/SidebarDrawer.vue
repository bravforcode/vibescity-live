<script setup>
import { useHaptics } from "@/composables/useHaptics";
import {
  ChevronRight,
  Coffee,
  Crown,
  Globe,
  Heart,
  LogOut,
  Music,
  Settings,
  ShoppingBag,
  Star,
  Volume2,
  VolumeX
} from "lucide-vue-next";
import { computed, ref } from "vue"; // ✅ Added computed
import { useI18n } from "vue-i18n"; // ✅ Added i18n

import SOSPanel from "./SOSPanel.vue"; // ✅ Sync Import to fix loading warning

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
]);
const { selectFeedback, successFeedback } = useHaptics();

// ✅ Computed Navigation Items for Reactivity
const menuItems = computed(() => [
  { id: "favorites", label: t("menu.favorites") || "My Favorites", icon: Heart, color: "bg-pink-600" },
  { id: "nightlife", label: t("menu.nightlife") || "Nightlife", icon: Music, color: "bg-purple-500" },
  { id: "cafe", label: t("menu.cafe") || "Cafe & Bistro", icon: Coffee, color: "bg-orange-400" },
  { id: "fashion", label: t("menu.fashion") || "Fashion", icon: ShoppingBag, color: "bg-pink-500" },
  { id: "events", label: t("menu.events") || "Events", icon: Star, color: "bg-yellow-400" },
]);

// SOS State
const showSOSPanel = ref(false);

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
  <div class="relative z-[6000]">
    <!-- Backdrop ... -->
    <!-- (Skip to content changes) -->

    <!-- ... -->
            <!-- Sound Toggle -->
            <button
              @click="
                emit('toggle-mute');
                selectFeedback();
              "
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white border border-white/5"
            >
              <div class="flex items-center gap-3">
                <VolumeX v-if="isMuted" class="w-4 h-4 text-white/50" />
                <Volume2 v-else class="w-4 h-4 text-blue-400" />
                <span class="text-sm font-medium">{{
                  isMuted ? t('menu.sound_off') || "Sound Off" : t('menu.sound_on') || "Sound On"
                }}</span>
              </div>
    <!-- ... -->
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

            <!-- Language Toggle -->
            <button
              @click="
                emit('toggle-language');
                selectFeedback();
              "
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white border border-white/5"
            >
              <div class="flex items-center gap-3">
                <Globe class="w-4 h-4 text-white/70" />
                <span class="text-sm font-medium">Language</span>
              </div>
              <span
                class="text-xs font-bold text-white/60 bg-white/10 px-2 py-1 rounded"
              >
                {{ currentLanguage === "en" ? "EN" : "TH" }}
              </span>
            </button>

            <button
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white border border-white/5"
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
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-900/40 to-purple-900/40 hover:from-blue-900/60 transition-all text-white border border-blue-500/30 mb-2 shadow-lg group"
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
              class="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-600/40 to-orange-600/40 hover:from-amber-600/60 transition-all text-white border border-amber-500/30 mb-2 shadow-lg group"
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
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 active:scale-95 transition-all text-red-500 hover:bg-red-500/10 border border-white/5"
            >
              <div class="flex items-center gap-3">
                <LogOut class="w-4 h-4" />
                <span class="text-sm font-medium">Log Out</span>
              </div>
            </button>
          </div>
        </div>

        <!-- ✅ Extracted SOS Panel Overlay (Cleaned up layer issues) -->
        <SOSPanel :isOpen="showSOSPanel" @close="showSOSPanel = false" />

        <!-- Footer -->
        <div class="p-6 text-center">
          <p class="text-[10px] text-white/20 font-mono">
            VibeCity v2.0.0 (Build 420)
          </p>
        </div>
      </div>
    </transition>
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

.drawer-backdrop-enter {
  animation: backdropIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.drawer-backdrop-leave {
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

.drawer-panel-enter {
  animation: drawerSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.drawer-panel-leave {
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
</style>
