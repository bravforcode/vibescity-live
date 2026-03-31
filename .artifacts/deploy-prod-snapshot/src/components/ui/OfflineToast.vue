<script setup>
import { Wifi, WifiOff } from "lucide-vue-next";
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useOfflineStore } from "@/store/offlineStore";

const { t } = useI18n();
const offlineStore = useOfflineStore();

const showToast = ref(false);
const showOnlineBriefly = ref(false);
let hideTimeout = null;

onMounted(() => {
	offlineStore.init();
});

watch(
	() => offlineStore.isOffline,
	(offline) => {
		if (offline) {
			showToast.value = true;
			showOnlineBriefly.value = false;
			if (hideTimeout) clearTimeout(hideTimeout);
		} else {
			// Reconnected
			showOnlineBriefly.value = true;
			hideTimeout = setTimeout(() => {
				showToast.value = false;
				showOnlineBriefly.value = false;
			}, 3000);
		}
	},
	{ immediate: true },
);
</script>

<template>
  <Transition name="offline-slide">
    <div
      v-if="showToast"
      class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
    >
      <div
        class="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md pointer-events-auto transition-colors duration-300 border"
        :class="
          showOnlineBriefly
            ? 'bg-emerald-500/90 border-emerald-400/50 shadow-emerald-500/20'
            : 'bg-zinc-900/95 border-zinc-700/50 shadow-black/50'
        "
      >
        <div
          class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          :class="
            showOnlineBriefly
              ? 'bg-emerald-400/20 text-emerald-100'
              : 'bg-rose-500/20 text-rose-400'
          "
        >
          <Wifi v-if="showOnlineBriefly" class="w-4 h-4" />
          <WifiOff v-else class="w-4 h-4 animate-pulse" />
        </div>

        <div class="flex flex-col pr-2">
          <span class="text-sm font-bold text-white leading-tight">
            {{
              showOnlineBriefly
                ? t("app.connection_restored", "Connection Restored")
                : t("app.you_are_offline", "You are currently offline")
            }}
          </span>
          <span
            class="text-xs font-medium opacity-80"
            :class="showOnlineBriefly ? 'text-emerald-100' : 'text-zinc-400'"
          >
            {{
              showOnlineBriefly
                ? t("app.syncing_data", "Back online and syncing...")
                : t(
                    "app.limited_functionality",
                    "App will continue to work normally",
                  )
            }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.offline-slide-enter-active,
.offline-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.offline-slide-enter-from,
.offline-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 150%) scale(0.9);
}
</style>
