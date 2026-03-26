<script setup>
import { X } from "lucide-vue-next";
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDialogA11y } from "@/composables/useDialogA11y";

const { t } = useI18n();

const showBanner = ref(false);
const isIOS = ref(false);
const bannerRef = ref(null);
const closeBtnRef = ref(null);
let deferredPrompt = null;
let showDelayTimer = null;

const clearShowDelayTimer = () => {
	if (showDelayTimer) {
		clearTimeout(showDelayTimer);
		showDelayTimer = null;
	}
};

const checkEnv = () => {
	const ua = window.navigator.userAgent.toLowerCase();
	const ios = /iphone|ipad|ipod/.test(ua);
	isIOS.value = ios;

	// Check if already installed
	const isStandalone =
		window.navigator.standalone ||
		window.matchMedia("(display-mode: standalone)").matches;

	if (!isStandalone) {
		// Only show iOS banner explicitly, Android relies on beforeinstallprompt
		if (ios) {
			const dismissed = localStorage.getItem("vibe_pwa_dismissed");
			if (!dismissed) {
				// Delay showing banner to not overwhelm
				clearShowDelayTimer();
				showDelayTimer = setTimeout(() => {
					showBanner.value = true;
				}, 3000);
			}
		}
	}
};

const handleBeforeInstallPrompt = (e) => {
	e.preventDefault(); // Prevent native mini-infobar
	deferredPrompt = e;

	const dismissed = localStorage.getItem("vibe_pwa_dismissed");
	if (!dismissed) {
		showBanner.value = true;
	}
};

const handleAppInstalled = () => {
	showBanner.value = false;
	deferredPrompt = null;
	localStorage.setItem("vibe_pwa_installed", "true");
};

onMounted(() => {
	if (typeof window === "undefined") return;

	// Android: Intercept the native install prompt
	window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
	window.addEventListener("appinstalled", handleAppInstalled);

	checkEnv();
});

onUnmounted(() => {
	if (typeof window !== "undefined") {
		window.removeEventListener(
			"beforeinstallprompt",
			handleBeforeInstallPrompt,
		);
		window.removeEventListener("appinstalled", handleAppInstalled);
	}
	clearShowDelayTimer();
});

const handleInstall = async () => {
	if (isIOS.value) {
		// Show instruction modal or trust the banner text
		return;
	}

	if (deferredPrompt) {
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;

		if (import.meta.env.DEV) {
			if (outcome === "accepted") {
				console.log("[PWA] User accepted install prompt");
			} else {
				console.log("[PWA] User dismissed install prompt");
			}
		}
		deferredPrompt = null;
		showBanner.value = false;
	}
};

const handleDismiss = () => {
	showBanner.value = false;
	localStorage.setItem("vibe_pwa_dismissed", "true");
};

useDialogA11y({
	isOpen: showBanner,
	containerRef: bannerRef,
	initialFocusRef: closeBtnRef,
	onClose: handleDismiss,
	lockScroll: false,
});
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="showBanner"
      class="fixed bottom-0 left-0 right-0 z-[9990] p-4 pb-safe pointer-events-none"
    >
      <div
        ref="bannerRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-banner-title"
        class="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl p-4 pointer-events-auto flex items-start gap-4"
      >
        <div
          class="w-12 h-12 rounded-xl bg-pink-500/20 shrink-0 flex items-center justify-center p-2 mt-0.5"
        >
          <img
            src="/pwa-192x192.png"
            alt="VibeCity App Icon"
            class="w-full h-full object-contain drop-shadow"
          />
        </div>

        <div class="flex-1 pt-0.5">
          <h3 id="install-banner-title" class="text-white font-bold mb-1">
            {{ t("app.install_vibecity", "Install VibeCity") }}
          </h3>

          <template v-if="isIOS">
            <p class="text-zinc-400 text-xs leading-relaxed">
              Tap the
              <span
                class="inline-block mx-1 w-6 h-6 bg-zinc-800 rounded flex items-center justify-center"
                ><svg
                  width="12"
                  height="14"
                  viewBox="0 0 14 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="text-blue-400"
                >
                  <path
                    d="M7 1v10M3 4l4-3 4 3M1 11v2a2 2 0 002 2h8a2 2 0 002-2v-2"
                  /></svg
              ></span>
              <strong>Share</strong> button and select
              <strong>"Add to Home Screen"</strong> for the best experience.
            </p>
          </template>

          <template v-else>
            <p class="text-zinc-400 text-xs leading-relaxed mb-3">
              {{
                t(
                  "app.install_desc",
                  "Get the app for faster loading and offline access.",
                )
              }}
            </p>
            <button
              @click="handleInstall"
              class="w-full py-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white rounded-lg font-bold text-sm transition-all active:scale-[0.98]"
            >
              {{ t("app.install_btn", "Install App") }}
            </button>
          </template>
        </div>

        <button
          ref="closeBtnRef"
          @click="handleDismiss"
          class="w-8 h-8 rounded-full bg-zinc-800/50 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
