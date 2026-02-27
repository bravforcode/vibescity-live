<script setup>
import ReloadPrompt from "@/components/pwa/ReloadPrompt.vue";
import VibeNotification from "@/components/ui/VibeNotification.vue";
import { useHomeBase } from "@/composables/useHomeBase";
import { useLocationStore } from "@/store/locationStore";
import { onMounted, watch } from "vue";

const locationStore = useLocationStore();
const { setHomeBase, hasHomeBase } = useHomeBase();

const parseEnvBool = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
};

// Default: disabled in dev, enabled in prod (unless explicitly overridden).
const analyticsEnabled =
  parseEnvBool(import.meta.env.VITE_ANALYTICS_ENABLED) ?? !import.meta.env.DEV;

const trackSessionIfAllowed = () => {
  if (!analyticsEnabled) return;
  void import("@/services/analyticsService")
    .then(({ analyticsService }) => analyticsService.trackSession())
    .catch(() => {});
};

onMounted(() => {
  trackSessionIfAllowed();

  // Start tracking location for Home Base
  locationStore.startWatching();
});

// Auto-set Home Base on first location fix
watch(
  () => locationStore.userLocation,
  (newLoc) => {
    if (newLoc && !hasHomeBase.value) {
      setHomeBase(newLoc[0], newLoc[1]);
      if (import.meta.env.DEV) {
        console.log("📍 Home Base set automatically:", newLoc);
      }
    }
  },
  { once: true }, // Only run once
);
</script>

<template>
  <!-- Skip Link for Keyboard Accessibility -->
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <ReloadPrompt />
  <router-view v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>
  <VibeNotification />
</template>

<style>
/* Restore Global Scrollbar from Original App.vue */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

/* ✅ UI Transitions */
.ui-slide-down-enter-active,
.ui-slide-down-leave-active,
.ui-slide-up-enter-active,
.ui-slide-up-leave-active {
  transition:
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1); /* iOS Ease */
}

.ui-slide-down-enter-from,
.ui-slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.ui-slide-up-enter-from,
.ui-slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
