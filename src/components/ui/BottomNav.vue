<script setup>
/**
 * BottomNav.vue - Premium Animated Bottom Navigation
 * Feature #7: Animated Tab Bar
 */
import { ref, computed } from "vue";

const props = defineProps({
  activeTab: {
    type: String,
    default: "map",
  },
  isDarkMode: {
    type: Boolean,
    default: true,
  },
  liveCount: {
    type: Number,
    default: 0,
  },
  favoritesCount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(["change-tab"]);

const tabs = [
  { id: "map", label: "Map", icon: "🗺️", activeIcon: "🗺️" },
  { id: "events", label: "Events", icon: "🎪", activeIcon: "🎉" },
  { id: "favorites", label: "Saved", icon: "🤍", activeIcon: "❤️" },
  { id: "profile", label: "Profile", icon: "👤", activeIcon: "😎" },
];

const handleTabClick = (tabId) => {
  emit("change-tab", tabId);
};

const getBadgeCount = (tabId) => {
  if (tabId === "events") return props.liveCount;
  if (tabId === "favorites") return props.favoritesCount;
  return 0;
};
</script>

<template>
  <nav
    :class="[
      'fixed bottom-0 left-0 right-0 z-[1000] safe-area-bottom',
      'backdrop-blur-xl border-t',
      isDarkMode
        ? 'bg-zinc-950/90 border-white/10'
        : 'bg-white/90 border-gray-200',
    ]"
  >
    <div class="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="handleTabClick(tab.id)"
        :class="[
          'relative flex flex-col items-center justify-center flex-1 h-full',
          'transition-all duration-300 ease-out',
          activeTab === tab.id ? 'scale-110' : 'scale-100 opacity-60',
        ]"
      >
        <!-- Active indicator -->
        <div
          v-if="activeTab === tab.id"
          class="absolute -top-0.5 w-12 h-1 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500"
        />

        <!-- Icon with animation -->
        <span
          :class="[
            'text-2xl transition-transform duration-300',
            activeTab === tab.id ? 'animate-bounce-once' : '',
          ]"
        >
          {{ activeTab === tab.id ? tab.activeIcon : tab.icon }}
        </span>

        <!-- Label -->
        <span
          :class="[
            'text-[10px] font-bold mt-0.5 uppercase tracking-wide',
            activeTab === tab.id
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400'
              : isDarkMode
                ? 'text-white/50'
                : 'text-gray-500',
          ]"
        >
          {{ tab.label }}
        </span>

        <!-- Badge -->
        <span
          v-if="getBadgeCount(tab.id) > 0"
          class="absolute top-1 right-1/4 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-black bg-red-500 text-white rounded-full shadow-lg shadow-red-500/30 animate-pulse"
        >
          {{ getBadgeCount(tab.id) > 9 ? "9+" : getBadgeCount(tab.id) }}
        </span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

@keyframes bounce-once {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.animate-bounce-once {
  animation: bounce-once 0.4s ease-out;
}
</style>
