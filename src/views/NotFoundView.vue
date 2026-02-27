<script setup>
import { useHead } from "@unhead/vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const SUPPORTED_LOCALES = new Set(["th", "en"]);

const normalizeLocale = (value) => {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	return SUPPORTED_LOCALES.has(raw) ? raw : null;
};

const readCookie = (name) => {
	if (typeof document === "undefined") return "";
	const target = `${name}=`;
	return document.cookie
		.split(";")
		.map((c) => c.trim())
		.filter((c) => c.startsWith(target))
		.map((c) => c.slice(target.length))[0];
};

const currentLocale = computed(() => {
	const fromRoute = normalizeLocale(route.params.locale);
	if (fromRoute) return fromRoute;
	if (typeof window === "undefined") return "th";
	const stored =
		localStorage.getItem("locale") || readCookie("vibe_locale") || "th";
	return normalizeLocale(stored) || "th";
});

const homeHref = computed(() => `/${currentLocale.value}`);
const pathLabel = computed(() => String(route.fullPath || route.path || ""));

useHead(() => ({
	title: "404 | VibeCity",
	htmlAttrs: { lang: currentLocale.value },
	meta: [{ name: "robots", content: "noindex,follow" }],
}));

const goHome = async () => {
	try {
		await router.push(homeHref.value);
	} catch {
		// ignore
	}
};
</script>

<template>
  <main class="min-h-[100dvh] bg-[#0f0f1a] text-white">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-14">
      <div class="space-y-2">
        <p class="text-xs font-black uppercase tracking-[0.25em] text-cyan-300/80">
          VibeCity
        </p>
        <h1 class="text-3xl font-black tracking-tight md:text-4xl">
          {{ t("not_found.title") }}
        </h1>
        <p class="text-white/70">
          {{ t("not_found.desc") }}
          <span class="font-mono text-white/90">{{ pathLabel }}</span>
        </p>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-black shadow-[0_12px_30px_rgba(34,211,238,0.25)] transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          @click="goHome"
        >
          {{ t("not_found.go_home") }}
        </button>
        <a
          :href="homeHref"
          class="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black text-white/90 backdrop-blur transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {{ t("not_found.open_home") }}
        </a>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <p class="text-sm text-white/70">
          {{ t("not_found.tip") }}
        </p>
      </div>
    </div>
  </main>
</template>

