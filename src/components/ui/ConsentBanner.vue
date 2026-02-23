<template>
  <Transition name="slide-up">
    <div v-if="show" class="fixed bottom-4 right-4 z-50 max-w-sm w-full">
      <div
        class="bg-gray-900/95 backdrop-blur-md border border-gray-700 text-white p-4 rounded-xl shadow-2xl"
      >
        <div class="flex items-start gap-3">
          <span class="text-2xl">🍪</span>
          <div>
            <h3 class="font-bold text-sm mb-1">VibeCity Analytics</h3>
            <p class="text-xs text-gray-400 leading-relaxed mb-3">
              We use anonymous cookies to improve your experience and count
              venue visits. No personal data is sold.
            </p>
            <a
              href="/privacy"
              class="text-xs text-blue-300 hover:text-blue-200 underline decoration-white/20"
            >
              Privacy policy
            </a>
            <div class="flex gap-2">
              <button
                @click="accept"
                class="flex-1 bg-white text-black text-xs font-bold py-2 px-3 rounded-lg hover:bg-gray-200 transition"
              >
                Okay, Cool
              </button>
              <button
                @click="decline"
                class="bg-transparent border border-gray-600 text-gray-400 text-xs font-bold py-2 px-3 rounded-lg hover:text-white hover:border-white transition"
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { onMounted, ref } from "vue";

const show = ref(false);

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

onMounted(() => {
	const choice = localStorage.getItem("vibe_analytics_consent");
	if (!choice) {
		setTimeout(() => {
			show.value = true;
		}, 2000); // Delay display
	}
});

const accept = () => {
	localStorage.setItem("vibe_analytics_consent", "granted");
	show.value = false;
	window.dispatchEvent(
		new CustomEvent("vibecity:consent", { detail: { analytics: "granted" } }),
	);

	// Trigger immediately (lazy import keeps initial bundle lean).
	if (analyticsEnabled) {
		void import("@/services/analyticsService")
			.then(({ analyticsService }) => analyticsService.trackSession())
			.catch(() => {});
	}
};

const decline = () => {
	localStorage.setItem("vibe_analytics_consent", "denied");
	show.value = false;
	window.dispatchEvent(
		new CustomEvent("vibecity:consent", { detail: { analytics: "denied" } }),
	);
};
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .slide-up-enter-active,
  .slide-up-leave-active {
    transition: none;
  }
}
</style>
