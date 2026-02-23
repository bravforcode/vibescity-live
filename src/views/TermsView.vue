<template>
  <main class="min-h-screen bg-[#0b0b12] text-white">
    <div class="mx-auto max-w-3xl px-6 py-12">
      <header class="mb-8">
        <h1 class="text-3xl font-black tracking-tight">Terms of Service</h1>
        <p class="mt-2 text-sm text-white/60">
          Last updated: {{ lastUpdated }}
        </p>
      </header>

      <section class="space-y-4 text-sm leading-7 text-white/80">
        <p>
          By using VibeCity, you agree to follow these terms. If you do not agree,
          please stop using the service.
        </p>

        <h2 class="pt-4 text-lg font-bold text-white">Use of the Service</h2>
        <ul class="list-disc pl-5 space-y-2">
          <li>Use VibeCity for lawful purposes only.</li>
          <li>Do not attempt to disrupt or reverse engineer the platform.</li>
          <li>Respect other users and venue operators.</li>
        </ul>

        <h2 class="pt-4 text-lg font-bold text-white">Content and Data</h2>
        <p>
          Venue information may change over time. We do our best to keep listings
          accurate, but do not guarantee completeness or accuracy.
        </p>

        <h2 class="pt-4 text-lg font-bold text-white">Availability</h2>
        <p>
          We may update, suspend, or discontinue parts of the service at any time.
          We are not liable for interruptions beyond our control.
        </p>

        <h2 class="pt-4 text-lg font-bold text-white">Liability</h2>
        <p>
          VibeCity is provided "as is." We are not responsible for losses resulting
          from reliance on venue information, availability, or third-party services.
        </p>

        <h2 class="pt-4 text-lg font-bold text-white">Contact</h2>
        <p>
          If you have questions about these terms, contact the VibeCity team.
        </p>
      </section>
    </div>
  </main>
</template>

<script setup>
import { useHead } from "@unhead/vue";
import { computed } from "vue";
import { useRoute } from "vue-router";

const lastUpdated = "2026-02-10";
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
const canonicalPath = computed(() => `/${currentLocale.value}/terms`);
const canonicalUrl = computed(() => `${SITE_ORIGIN}${canonicalPath.value}`);
const hreflangLinks = computed(() => [
	{ rel: "alternate", hreflang: "th", href: `${SITE_ORIGIN}/th/terms` },
	{ rel: "alternate", hreflang: "en", href: `${SITE_ORIGIN}/en/terms` },
	{ rel: "alternate", hreflang: "x-default", href: `${SITE_ORIGIN}/th/terms` },
]);

useHead(() => ({
	title: "Terms of Service | VibeCity",
	link: [
		{ rel: "canonical", href: canonicalUrl.value },
		...hreflangLinks.value,
	],
	meta: [
		{
			name: "description",
			content: "VibeCity terms of service and usage guidelines.",
		},
		{ property: "og:title", content: "Terms of Service | VibeCity" },
		{
			property: "og:description",
			content: "Read the VibeCity terms of service and usage guidelines.",
		},
		{ property: "og:url", content: canonicalUrl.value },
		{ property: "og:type", content: "website" },
	],
}));
</script>
