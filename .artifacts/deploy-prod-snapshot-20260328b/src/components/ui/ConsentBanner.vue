<template>
  <Transition name="slide-up">
    <div
      v-if="show"
      data-testid="consent-banner"
      class="fixed right-4 z-[60] max-w-sm w-[calc(100%-2rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div
        ref="dialogRef"
        tabindex="-1"
        class="relative bg-gray-900/95 backdrop-blur-md border border-gray-700 text-white p-4 rounded-xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-banner-title"
        aria-describedby="consent-banner-desc"
      >
        <button
          type="button"
          class="absolute top-2 right-2 w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close consent banner"
          @click="decline"
        >
          ✕
        </button>
        <div class="flex items-start gap-3">
          <span class="text-2xl" aria-hidden="true">🍪</span>
          <div>
            <h3 id="consent-banner-title" class="font-bold text-sm mb-1">
              VibeCity Analytics
            </h3>
            <p
              id="consent-banner-desc"
              class="text-xs text-gray-400 leading-relaxed mb-3"
            >
              We use anonymous cookies to improve your experience and count
              venue visits. No personal data is sold.
            </p>
            <a
              href="/privacy"
              class="text-xs text-blue-300 hover:text-blue-200 underline decoration-white/20"
            >
              Privacy policy
            </a>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                @click="accept"
                :disabled="isPersisting"
                class="min-h-[40px] bg-white text-black text-xs font-bold py-2 px-3 rounded-lg hover:bg-gray-200 transition disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80"
              >
                Okay, Cool
              </button>
              <button
                type="button"
                @click="decline"
                :disabled="isPersisting"
                class="min-h-[40px] bg-transparent border border-gray-600 text-gray-400 text-xs font-bold py-2 px-3 rounded-lg hover:text-white hover:border-white transition disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80"
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
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const show = ref(false);
const isPersisting = ref(false);
const dialogRef = ref(null);
let previousActiveElement = null;

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

const focusableSelector =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusableElements = () => {
	const root = dialogRef.value;
	if (!root) return [];
	return Array.from(root.querySelectorAll(focusableSelector)).filter(
		(el) => !el.hasAttribute("disabled"),
	);
};

const handleTrapFocus = (event) => {
	if (!show.value || event.key !== "Tab") return;
	const focusable = getFocusableElements();
	if (!focusable.length) return;

	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	const active = document.activeElement;

	if (event.shiftKey && active === first) {
		event.preventDefault();
		last.focus();
		return;
	}
	if (!event.shiftKey && active === last) {
		event.preventDefault();
		first.focus();
	}
};

const handleEsc = (event) => {
	if (!show.value) return;
	if (event.key !== "Escape") return;
	event.preventDefault();
	decline();
};

onMounted(() => {
	if (typeof window === "undefined") return;
	if (import.meta.env.VITE_E2E === "true") {
		return;
	}
	const choice = localStorage.getItem("vibe_analytics_consent");
	if (!choice) {
		setTimeout(() => {
			show.value = true;
		}, 2000); // Delay display
	}
});

const accept = () => {
	if (isPersisting.value) return;
	isPersisting.value = true;
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
	isPersisting.value = false;
};

const decline = () => {
	if (isPersisting.value) return;
	isPersisting.value = true;
	localStorage.setItem("vibe_analytics_consent", "denied");
	show.value = false;
	window.dispatchEvent(
		new CustomEvent("vibecity:consent", { detail: { analytics: "denied" } }),
	);
	isPersisting.value = false;
};

watch(show, async (visible) => {
	if (typeof window === "undefined") return;
	if (visible) {
		previousActiveElement = document.activeElement;
		await nextTick();
		const focusable = getFocusableElements();
		focusable[0]?.focus?.();
		window.addEventListener("keydown", handleTrapFocus);
		window.addEventListener("keydown", handleEsc);
		return;
	}
	window.removeEventListener("keydown", handleTrapFocus);
	window.removeEventListener("keydown", handleEsc);
	previousActiveElement?.focus?.();
	previousActiveElement = null;
});

onUnmounted(() => {
	if (typeof window === "undefined") return;
	window.removeEventListener("keydown", handleTrapFocus);
	window.removeEventListener("keydown", handleEsc);
});
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

@media (max-width: 768px) {
  .fixed[data-testid="consent-banner"] {
    left: 0.75rem;
    right: 0.75rem;
    width: auto;
    bottom: calc(0.9rem + env(safe-area-inset-bottom));
  }
}
</style>
