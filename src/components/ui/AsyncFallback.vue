<script setup>
/**
 * AsyncFallback.vue — Lightweight error fallback for defineAsyncComponent.
 * Shows a retry button when a lazy-loaded chunk fails to load.
 * Retries by re-importing the chunk instead of reloading the entire page.
 */

import { RefreshCw } from "lucide-vue-next";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const retryCount = ref(0);
const maxRetries = 3;

const retry = () => {
	if (retryCount.value < maxRetries) {
		retryCount.value++;
		// Bust the module cache by appending a query param to force re-fetch
		const currentUrl = new URL(window.location.href);
		currentUrl.searchParams.set("_cr", String(retryCount.value));
		window.location.assign(currentUrl.toString());
	} else {
		// Last resort after max retries — full reload
		window.location.reload();
	}
};
</script>

<template>
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-xl bg-white/5 px-4 py-6 text-center"
		role="alert"
	>
		<p class="text-sm text-white/60">
			{{ t("error.component_failed") }}
			<span v-if="retryCount > 0" class="block text-xs text-white/40 mt-1">
				({{ retryCount }}/{{ maxRetries }})
			</span>
		</p>
		<button
			class="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/20 active:scale-95"
			@click="retry"
		>
			<RefreshCw class="h-4 w-4" />
			{{ t("common.retry") }}
		</button>
	</div>
</template>
