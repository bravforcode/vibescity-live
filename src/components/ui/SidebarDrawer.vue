<script setup>
import { ref, computed } from "vue";
import {
  X,
  User,
  Settings,
  LogOut,
  MapPin,
  Coffee,
  ShoppingBag,
  Music,
  Star,
  ChevronRight,
} from "lucide-vue-next";
import { useHaptics } from "@/composables/useHaptics";

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
});

const emit = defineEmits(["close", "navigate"]);
const { selectFeedback, successFeedback } = useHaptics();

// Navigation Items
const menuItems = [
  { id: "nightlife", label: "Nightlife", icon: Music, color: "bg-purple-500" },
  { id: "cafe", label: "Cafe & Bistro", icon: Coffee, color: "bg-orange-400" },
  { id: "fashion", label: "Fashion", icon: ShoppingBag, color: "bg-pink-500" },
  { id: "events", label: "Events", icon: Star, color: "bg-yellow-400" },
];

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
    <!-- Backdrop -->
    <transition
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-300 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
      data-testid="drawer-shell"
        v-if="isOpen"
        @click="handleClose"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm"
      ></div>
    </transition>

    <!-- Drawer Panel -->
    <transition
      enter-active-class="transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed top-0 left-0 bottom-0 w-[80%] max-w-[320px] bg-zinc-900/95 backdrop-blur-2xl border-r border-white/10 shadow-[20px_0_50px_rgba(0,0,0,0.5)] flex flex-col pt-safe-top pb-safe-bottom"
      >
        <!-- Header / Close -->
        <div class="absolute top-4 right-4 z-10">
          <button
            @click="handleClose"
            class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-all"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- 1. Stats Card (Premium Glass) -->
        <div class="p-6 pb-2">
          <div
            class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600/30 to-purple-600/30 border border-white/20 p-5 shadow-2xl group"
          >
            <div class="absolute inset-0 bg-white/5 backdrop-blur-md"></div>

            <!-- Content -->
            <div class="relative z-10 flex flex-col items-center gap-3">
              <!-- Avatar -->
              <div class="relative">
                <div
                  class="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-yellow-400 to-purple-500 shadow-lg"
                >
                  <div
                    class="w-full h-full rounded-full bg-black overflow-hidden relative"
                  >
                    <img
                      v-if="userStats.avatar"
                      :src="userStats.avatar"
                      class="w-full h-full object-cover"
                    />
                    <div
                      v-else
                      class="w-full h-full flex items-center justify-center bg-zinc-800 text-white"
                    >
                      <User class="w-8 h-8" />
                    </div>
                  </div>
                </div>
                <div
                  class="absolute -bottom-1 -right-1 bg-black/80 backdrop-blur text-xs font-black px-2 py-0.5 rounded-full border border-white/20 text-yellow-400"
                >
                  LV.{{ userStats.level }}
                </div>
              </div>

              <h2 class="text-xl font-black text-white tracking-tight">
                {{ userStats.name }}
              </h2>

              <div
                class="flex items-center gap-2 bg-black/40 rounded-full px-3 py-1 border border-white/10"
              >
                <div
                  class="w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] shadow-lg shadow-yellow-400/50"
                >
                  $
                </div>
                <span class="text-sm font-bold text-yellow-100"
                  >{{ userStats.coins.toLocaleString() }} Coins</span
                >
              </div>
            </div>

            <!-- Shine Effect -->
            <div
              class="absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine"
            />
          </div>
        </div>

        <!-- 2. Menu Grid -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div class="space-y-3">
            <h3
              class="text-xs font-black text-white/40 uppercase tracking-widest px-1"
            >
              Explore
            </h3>
            <div class="grid grid-cols-2 gap-3">
              <button
                v-for="item in menuItems"
                :key="item.id"
                @click="handleNavigate(item.id)"
                class="relative h-24 rounded-2xl bg-white/5 border border-white/5 overflow-hidden group active:scale-95 transition-all"
              >
                <div
                  :class="[
                    'absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity',
                    item.color,
                  ]"
                ></div>
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2"
                >
                  <component
                    :is="item.icon"
                    class="w-6 h-6 text-white drop-shadow-lg"
                  />
                  <span
                    class="text-xs font-bold text-white uppercase tracking-wider"
                    >{{ item.label }}</span
                  >
                </div>
              </button>
            </div>
          </div>

          <!-- Settings List -->
          <div class="space-y-1">
            <h3
              class="text-xs font-black text-white/40 uppercase tracking-widest px-1 mb-2"
            >
              System
            </h3>
            <button
              class="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white border border-white/5"
            >
              <div class="flex items-center gap-3">
                <Settings class="w-4 h-4 text-white/70" />
                <span class="text-sm font-medium">Settings</span>
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
</style>
