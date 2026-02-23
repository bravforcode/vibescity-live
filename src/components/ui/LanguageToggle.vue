<script setup>
import { Globe } from "lucide-vue-next";
import { useHaptics } from "@/composables/useHaptics";
import i18n from "@/i18n.js";
import { useUserStore } from "@/store/userStore";

const userStore = useUserStore();
const { tapFeedback } = useHaptics();
const currentLocale = () =>
	typeof i18n?.global?.locale === "string"
		? i18n.global.locale
		: String(i18n?.global?.locale?.value || "en");
const setLocaleValue = (newLang) => {
	try {
		if (i18n?.global?.locale && typeof i18n.global.locale === "object") {
			i18n.global.locale.value = newLang;
			return;
		}
		if (i18n?.global) {
			i18n.global.locale = newLang;
		}
	} catch {
		if (i18n?.global) {
			i18n.global.locale = newLang;
		}
	}
};

const toggleLanguage = () => {
	tapFeedback();
	const newLang = currentLocale() === "en" ? "th" : "en";
	setLocaleValue(newLang);
	userStore.setLanguage(newLang);
};
</script>

<template>
  <button
    @click="toggleLanguage"
    class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-colors transition-transform active:scale-95"
    aria-label="Toggle Language"
  >
    <Globe class="w-4 h-4 text-white" />
    <span class="text-xs font-bold text-white uppercase">{{ currentLocale() }}</span>
  </button>
</template>
