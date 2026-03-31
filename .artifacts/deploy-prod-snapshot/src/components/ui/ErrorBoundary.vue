<script setup>
import { AlertOctagon, RefreshCw } from "lucide-vue-next";
import { onErrorCaptured, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const hasError = ref(false);
const error = ref(null);

onErrorCaptured((err, _instance, info) => {
	hasError.value = true;
	error.value = err;
	if (import.meta.env.DEV) {
		console.error("🛑 Captured in ErrorBoundary:", err, "\nInfo:", info);
	}
	// Return false to stop the error from propagating further up
	return false;
});

const reset = () => {
	hasError.value = false;
	error.value = null;
};
</script>

<template>
  <div class="contents">
    <template v-if="hasError">
      <!-- Custom fallback slot (e.g. MapErrorFallback) -->
      <slot name="fallback" :error="error" :reset="reset">
        <!-- Default fallback UI -->
        <div
          role="alert"
          class="relative flex flex-col items-center justify-center min-h-[50vh] p-6 text-center"
        >
          <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-500/20 blur-3xl opacity-50 rounded-full animate-pulse"
            ></div>
          </div>

          <div
            class="relative z-10 flex flex-col items-center max-w-sm space-y-6"
          >
            <div
              class="flex items-center justify-center w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 shadow-inner"
            >
              <AlertOctagon
                class="w-10 h-10 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              />
            </div>

            <div class="space-y-2">
              <h2 class="text-2xl font-black text-white tracking-wide">
                {{ t("error.system_glitch") }}
              </h2>
              <p class="text-sm text-zinc-400">
                {{ t("error.component_failed") }}
              </p>
            </div>

            <button
              @click="reset"
              class="group relative flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-bold transition duration-300"
            >
              <RefreshCw
                class="w-4 h-4 transition-transform duration-500 group-hover:rotate-180"
              />
              <span>{{ t("error.reload_component") }}</span>
            </button>
          </div>
        </div>
      </slot>
    </template>
    <slot v-else></slot>
  </div>
</template>
