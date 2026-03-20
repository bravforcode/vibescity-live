<template>
  <main class="min-h-screen bg-[#0b0b12] text-white">
    <div class="mx-auto max-w-3xl px-6 py-12">
      <header class="mb-8">
        <h1 class="text-3xl font-black tracking-tight">{{ $t("auto.k_2526541f") }}</h1>
        <p class="mt-2 text-sm text-white/60"> {{ $t("auto.k_50ebf3c0") }} {{ lastUpdated }}
        </p>
      </header>

      <section class="space-y-4 text-sm leading-7 text-white/80">
        <p> {{ $t("auto.k_f54da0f6") }} </p>

        <h2 class="pt-4 text-lg font-bold text-white">{{ $t("auto.k_17afbdef") }}</h2>
        <ul class="list-disc pl-5 space-y-2">
          <li> {{ $t("auto.k_c0f7d53b") }}<code class="text-white/90">visitor_id</code>{{ $t("auto.k_caad9055") }} </li>
          <li> {{ $t("auto.k_8be44d7e") }} </li>
          <li> {{ $t("auto.k_ad0abcf2") }} </li>
          <li> {{ $t("auto.k_854fe812") }} </li>
          <li>
            <strong class="text-white">{{ $t("auto.k_f9269488") }}</strong> {{ $t("auto.k_5a2b3250") }} </li>
        </ul>

        <h2 class="pt-4 text-lg font-bold text-white">{{ $t("auto.k_85ee7ae1") }}</h2>
        <ul class="list-disc pl-5 space-y-2">
          <li>{{ $t("auto.k_2c612766") }}</li>
          <li>{{ $t("auto.k_a26b6737") }}</li>
        </ul>

        <h2 class="pt-4 text-lg font-bold text-white">Consent</h2>
        <p> {{ $t("auto.k_5aeec80e") }} </p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-white text-black px-4 py-2 text-xs font-bold hover:bg-white/90 transition-colors"
            @click="grantAnalytics"
          > {{ $t("auto.k_d629565e") }} </button>
          <button
            type="button"
            class="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:text-white hover:border-white/40 transition-colors"
            @click="denyAnalytics"
          > {{ $t("auto.k_df4842cf") }} </button>
          <span class="text-xs text-white/60 self-center"> {{ $t("auto.k_51a35dc0") }} <span class="text-white/90">{{ consentLabel }}</span>
          </span>
        </div>

        <h2 class="pt-4 text-lg font-bold text-white">Retention</h2>
        <p> {{ $t("auto.k_8b9f8acb") }} <strong class="text-white">{{ $t("auto.k_2d8a9817") }}</strong>.
        </p>

        <h2 class="pt-4 text-lg font-bold text-white">Contact</h2>
        <p> {{ $t("auto.k_266e7ae7") }} </p>
      </section>
    </div>
  </main>
</template>

<script setup>
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

const lastUpdated = "2026-02-10";
const STORAGE_KEY = "vibe_analytics_consent";
const consent = ref(
	typeof window === "undefined"
		? "unset"
		: localStorage.getItem(STORAGE_KEY) || "unset",
);

const SITE_ORIGIN = "https://vibecity.live";
const SUPPORTED_LOCALES = new Set(["th", "en"]);
const normalizeLocale = (value) => {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	return SUPPORTED_LOCALES.has(raw) ? raw : null;
};
const route = useRoute();
const getStoredLocale = () => {
	if (typeof window === "undefined") return null;
	const stored =
		localStorage.getItem("locale") || localStorage.getItem("vibe_locale") || "";
	return normalizeLocale(stored);
};
const currentLocale = computed(() => {
	const fromRoute = normalizeLocale(route.params.locale);
	return fromRoute || getStoredLocale() || "th";
});
const canonicalPath = computed(() => `/${currentLocale.value}/privacy`);
const canonicalUrl = computed(() => `${SITE_ORIGIN}${canonicalPath.value}`);
const hreflangLinks = computed(() => [
	{
		rel: "alternate",
		hreflang: "th",
		href: `${SITE_ORIGIN}/th/privacy`,
	},
	{
		rel: "alternate",
		hreflang: "en",
		href: `${SITE_ORIGIN}/en/privacy`,
	},
	{
		rel: "alternate",
		hreflang: "x-default",
		href: `${SITE_ORIGIN}/th/privacy`,
	},
]);

const consentLabel = computed(() => {
	if (consent.value === "granted") return "granted";
	if (consent.value === "denied") return "denied";
	return "unset";
});

const setConsent = (value) => {
	localStorage.setItem(STORAGE_KEY, value);
	consent.value = value;
	window.dispatchEvent(
		new CustomEvent("vibecity:consent", { detail: { analytics: value } }),
	);
};

const grantAnalytics = () => setConsent("granted");
const denyAnalytics = () => setConsent("denied");

useHead(() => ({
	title: "Privacy Policy | VibeCity",
	link: [
		{ rel: "canonical", href: canonicalUrl.value },
		...hreflangLinks.value,
	],
	meta: [
		{
			name: "description",
			content: "VibeCity privacy policy and analytics consent settings.",
		},
		{ property: "og:title", content: "Privacy Policy | VibeCity" },
		{
			property: "og:description",
			content: "How VibeCity handles analytics and privacy.",
		},
		{ property: "og:url", content: canonicalUrl.value },
		{ property: "og:type", content: "website" },
	],
}));
</script>
