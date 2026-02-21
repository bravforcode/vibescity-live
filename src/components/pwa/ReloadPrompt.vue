<script setup>
import { RefreshCw, WifiOff, X } from "lucide-vue-next";
import { onMounted, ref } from "vue";

// ✅ Native PWA Service Worker Detection (Rsbuild-compatible)
const offlineReady = ref(false);
const needRefresh = ref(false);
let sw = null;

const parseEnvBool = (value) => {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return null;
	if (["1", "true", "yes", "on"].includes(raw)) return true;
	if (["0", "false", "no", "off"].includes(raw)) return false;
	return null;
};

const updateServiceWorker = async () => {
	if (sw?.waiting) {
		sw.waiting.postMessage({ type: "SKIP_WAITING" });
	}
	needRefresh.value = false;
	window.location.reload();
};

onMounted(() => {
	// In dev, SW is disabled by default. Avoid showing offline/refresh toasts unless explicitly enabled.
	const swDevEnabled = parseEnvBool(import.meta.env.VITE_SW_DEV) === true;
	if (import.meta.env.DEV && !swDevEnabled) return;

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.ready.then((registration) => {
			sw = registration;
			offlineReady.value = true;

			// Check for updates
			registration.addEventListener("updatefound", () => {
				const newWorker = registration.installing;
				if (newWorker) {
					newWorker.addEventListener("statechange", () => {
						if (
							newWorker.state === "installed" &&
							navigator.serviceWorker.controller
						) {
							needRefresh.value = true;
						}
					});
				}
			});
		});
	}
});

const close = async () => {
	offlineReady.value = false;
	needRefresh.value = false;
};
</script>

<template>
  <!-- Global PWA Toast Container -->
  <div
    v-if="offlineReady || needRefresh"
    class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9999] flex flex-col gap-2"
    role="alert"
  >
    <div
      class="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-4 animate-slide-up"
    >
      <!-- Icon -->
      <div
        class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        :class="
          needRefresh
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-green-500/20 text-green-400'
        "
      >
        <RefreshCw v-if="needRefresh" class="w-5 h-5 animate-spin-slow" />
        <WifiOff v-else class="w-5 h-5" />
      </div>

      <!-- Content -->
      <div class="flex-1 pt-0.5">
        <h3 class="text-sm font-bold text-white mb-0.5">
          {{ needRefresh ? "New Content Available" : "Ready for Offline" }}
        </h3>
        <p class="text-xs text-zinc-400 leading-relaxed">
          {{
            needRefresh
              ? "A new version of VibeCity is available. Update now to get the latest vibes."
              : "App cached successfully. You can now use VibeCity without internet."
          }}
        </p>

        <!-- Actions -->
        <div class="mt-3 flex gap-2" v-if="needRefresh">
          <button
            @click="updateServiceWorker()"
            class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-lg shadow-blue-500/20"
          >
            Update Now
          </button>
          <button
            @click="close"
            class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
        <button
          v-else
          @click="close"
          class="mt-3 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors"
        >
          Close
        </button>
      </div>

      <!-- Close X -->
      <button
        @click="close"
        class="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-up {
  animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
