<script setup lang="ts">
import { useNetwork } from "@vueuse/core";
import { Wifi, WifiOff } from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { isOnline } = useNetwork();
const showReconnect = ref(false);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const isOffline = computed(() => !isOnline.value);
const shouldShow = computed(() => isOffline.value || showReconnect.value);

watch(
	isOnline,
	(nextValue) => {
		if (!nextValue) {
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			showReconnect.value = false;
			return;
		}

		showReconnect.value = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(() => {
			showReconnect.value = false;
		}, 2_500);
	},
	{ immediate: true },
);

onUnmounted(() => {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
});
</script>

<template>
  <Transition name="offline-banner">
    <div
      v-if="shouldShow"
      class="fixed inset-x-0 top-0 z-[9998] px-4 pt-safe-top pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        class="mx-auto flex w-full max-w-3xl items-center justify-between rounded-b-2xl border px-4 py-2 shadow-xl backdrop-blur-md pointer-events-auto"
        :class="
          isOffline
            ? 'border-amber-300/50 bg-amber-500/95 text-black'
            : 'border-emerald-300/40 bg-emerald-500/90 text-black'
        "
      >
        <div class="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
          <WifiOff v-if="isOffline" class="h-4 w-4" aria-hidden="true" />
          <Wifi v-else class="h-4 w-4" aria-hidden="true" />
          <span>
            {{
              isOffline
                ? t('app.you_are_offline', 'Offline mode enabled')
                : t('app.connection_restored', 'Connection restored')
            }}
          </span>
        </div>
        <span class="text-[0.6875rem] font-semibold opacity-90">
          {{
            isOffline
              ? t('app.limited_functionality', 'Actions will sync when online')
              : t('app.syncing_data', 'Syncing queued actions')
          }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.offline-banner-enter-active,
.offline-banner-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.offline-banner-enter-from,
.offline-banner-leave-to {
  opacity: 0;
  transform: translate3d(0, -100%, 0);
}
</style>
