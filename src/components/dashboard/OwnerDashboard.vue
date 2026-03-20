<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useDashboardGuard } from "@/composables/useDashboardGuard";
import { useNotifications } from "@/composables/useNotifications";
import { ownerService } from "../../services/ownerService";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
} from "../../services/visitorIdentity";
import EditVenueModal from "../modal/EditVenueModal.vue";
import BuyPinsPanel from "./BuyPinsPanel.vue";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { notifyError } = useNotifications();
useDashboardGuard("owner", { allowVisitorFallback: true, strictAuth: false });

const loading = ref(true);
const dashboardError = ref("");
const dashboardNotice = ref("");
const visitorId = ref("");
const days = ref(30);
const searchText = ref("");
const statusFilter = ref("all");
const sortKey = ref("views");
const payloadSource = ref({
	portfolio: "api",
	venues: "api",
	insights: "api",
});

const portfolio = ref(null);
const venues = ref([]);
const insights = ref<any>({
	trend: [],
	actions: [],
	expiring: [],
	summary: {},
});

const promotingVenue = ref(null);
const editingVenue = ref(null);

const sourceBadge = computed(() => {
	const values = Object.values(payloadSource.value);
	const hasSupabaseFallback = values.includes("supabase_fallback");
	const hasLocalFallback = values.includes("local_fallback");
	return {
		mode: hasSupabaseFallback || hasLocalFallback ? "fallback" : "api",
		label: hasLocalFallback
			? "Local fallback mode"
			: hasSupabaseFallback
				? "Fallback mode (Supabase)"
				: "Live API mode",
	};
});

const fallbackModules = computed(() =>
	Object.entries(payloadSource.value)
		.filter(([, value]) =>
			["supabase_fallback", "local_fallback"].includes(value),
		)
		.map(([key]) => key),
);

const fallbackNotice = computed(() =>
	Object.values(payloadSource.value).includes("local_fallback")
		? t("ownerDashboard.local_fallback_notice")
		: t("ownerDashboard.supabase_fallback_notice"),
);

const kpis = computed(
	() =>
		portfolio.value?.kpis || {
			venues_total: 0,
			venues_live: 0,
			total_views: 0,
			avg_rating: 0,
			promoted: 0,
		},
);

const expiringMap = computed(() => portfolio.value?.expiring_7d || {});
const expiringTotal = computed(
	() =>
		Number(expiringMap.value.verified_until || 0) +
		Number(expiringMap.value.glow_until || 0) +
		Number(expiringMap.value.boost_until || 0) +
		Number(expiringMap.value.giant_until || 0),
);

const kpiCards = computed(() => [
	{
		label: "Venues",
		value: formatNumber(kpis.value.venues_total),
		tone: "from-cyan-400/25 to-blue-600/20",
	},
	{
		label: "Live",
		value: formatNumber(kpis.value.venues_live),
		tone: "from-emerald-400/25 to-indigo-600/20",
	},
	{
		label: "Views",
		value: formatNumber(kpis.value.total_views),
		tone: "from-cyan-500/25 to-cyan-600/20",
	},
	{
		label: "Rating",
		value: Number(kpis.value.avg_rating || 0).toFixed(2),
		tone: "from-cyan-400/25 to-orange-600/20",
	},
	{
		label: "Promoted",
		value: formatNumber(kpis.value.promoted),
		tone: "from-pink-500/25 to-rose-600/20",
	},
	{
		label: "Expiring 7d",
		value: formatNumber(expiringTotal.value),
		tone: "from-sky-400/25 to-indigo-600/20",
	},
]);

const filteredVenues = computed(() => {
	const q = searchText.value.trim().toLowerCase();
	let rows = [...(venues.value || [])];

	if (statusFilter.value !== "all") {
		rows = rows.filter((row) => {
			const status = String(row.status || "").toLowerCase();
			if (statusFilter.value === "live") return row.is_live;
			if (statusFilter.value === "promoted") return row.is_promoted;
			if (statusFilter.value === "needs-work")
				return Number(row?.completeness?.score || 0) < 60;
			return status === statusFilter.value;
		});
	}

	if (q) {
		rows = rows.filter((row) => {
			const name = String(row.name || "").toLowerCase();
			const category = String(row.category || "").toLowerCase();
			return name.includes(q) || category.includes(q);
		});
	}

	rows.sort((a, b) => {
		if (sortKey.value === "rating") {
			return Number(b.rating || 0) - Number(a.rating || 0);
		}
		if (sortKey.value === "completeness") {
			return (
				Number(b?.completeness?.score || 0) -
				Number(a?.completeness?.score || 0)
			);
		}
		if (sortKey.value === "updated") {
			return (
				new Date(b.updated_at || 0).getTime() -
				new Date(a.updated_at || 0).getTime()
			);
		}
		if (sortKey.value === "live") {
			return Number(b.is_live) - Number(a.is_live);
		}
		return Number(b.total_views || 0) - Number(a.total_views || 0);
	});

	return rows;
});

const expiryTimeline = computed(() => {
	const fields = [
		{ key: "verified_until", label: "Verified" },
		{ key: "glow_until", label: "Glow" },
		{ key: "boost_until", label: "Boost" },
		{ key: "giant_until", label: "Giant" },
	];
	const out = [];
	for (const venue of venues.value || []) {
		for (const field of fields) {
			const at = venue?.[field.key];
			if (!at) continue;
			const dt = new Date(at);
			if (Number.isNaN(dt.getTime())) continue;
			out.push({
				venueId: venue.id,
				venueName: venue.name || "Unnamed",
				feature: field.label,
				at,
				timestamp: dt.getTime(),
			});
		}
	}
	out.sort((a, b) => a.timestamp - b.timestamp);
	return out.slice(0, 20);
});

const qualitySummary = computed(() => {
	const totals = {
		image: 0,
		open_time: 0,
		category: 0,
		social: 0,
		pin: 0,
	};
	for (const venue of venues.value || []) {
		const missing = Array.isArray(venue?.completeness?.missing)
			? venue.completeness.missing
			: [];
		for (const key of missing) {
			if (totals[key] !== undefined) totals[key] += 1;
		}
	}
	return totals;
});

const growthActions = computed(() => {
	const apiActions = Array.isArray(insights.value?.actions)
		? insights.value.actions
		: [];
	const merged = [...apiActions];
	if (
		Number(kpis.value.promoted || 0) === 0 &&
		(venues.value || []).length > 0
	) {
		merged.push({
			type: "growth",
			priority: "medium",
			label: "Promote at least one venue",
			description: "No promoted venue detected in portfolio.",
		});
	}
	if (
		(venues.value || []).some((v) => Number(v?.completeness?.score || 0) < 60)
	) {
		merged.push({
			type: "content",
			priority: "high",
			label: "Fix missing venue profile fields",
			description: "Low completeness reduces discovery and conversion.",
		});
	}
	return merged.slice(0, 8);
});

const trendRows = computed(() =>
	(Array.isArray(insights.value?.trend) ? insights.value.trend : []).slice(-14),
);
const trendMax = computed(() =>
	Math.max(1, ...trendRows.value.map((row) => Number(row.events || 0))),
);
const promoteTargetVenue = computed(() => {
	const rows = Array.isArray(venues.value) ? venues.value : [];
	return (
		rows.find((row) => !row?.is_promoted) ||
		rows.find((row) => Number(row?.completeness?.score || 0) < 60) ||
		rows[0] ||
		null
	);
});
const topVenue = computed(() => {
	const rows = [...(venues.value || [])];
	rows.sort(
		(left, right) =>
			Number(right?.total_views || 0) - Number(left?.total_views || 0),
	);
	return rows[0] || null;
});
const nextExpiryItem = computed(() => expiryTimeline.value[0] || null);
const needsWorkCount = computed(
	() =>
		(venues.value || []).filter(
			(row) => Number(row?.completeness?.score || 0) < 60,
		).length,
);

const formatNumber = (value) =>
	new Intl.NumberFormat("th-TH").format(Number(value || 0));

const formatDate = (value) => {
	if (!value) return "-";
	const dt = new Date(value);
	if (Number.isNaN(dt.getTime())) return "-";
	return dt.toLocaleString("th-TH", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const openPromote = (venue) => {
	promotingVenue.value = venue;
};

const closePromote = () => {
	promotingVenue.value = null;
};

const openEdit = (venue) => {
	editingVenue.value = venue;
};

const closeEdit = (shouldRefresh = false) => {
	editingVenue.value = null;
	if (shouldRefresh) void fetchDashboardData();
};

const resolveHomePath = () => {
	const locale = String(route.params?.locale || "")
		.trim()
		.toLowerCase();
	if (locale === "th" || locale === "en") {
		return `/${locale}`;
	}
	return "/en";
};

const safeExit = async () => {
	try {
		await router.push(resolveHomePath());
	} catch {
		window.location.href = resolveHomePath();
	}
};

const isAuthOrTechError = (msg) => {
	if (!msg) return true;
	const lower = String(msg).toLowerCase();
	return (
		lower.includes("api key") ||
		lower.includes("jwt") ||
		lower.includes("unauthorized") ||
		lower.includes("invalid key") ||
		lower.includes("401")
	);
};

const fetchDashboardData = async () => {
	loading.value = true;
	dashboardError.value = "";
	dashboardNotice.value = "";
	try {
		visitorId.value = getOrCreateVisitorId();
		await bootstrapVisitor();

		const results = await Promise.allSettled([
			ownerService.getPortfolio(visitorId.value),
			ownerService.getVenues(visitorId.value, 120),
			ownerService.getInsights(visitorId.value, days.value),
		]);

		let loadedCount = 0;
		const notices = [];

		const [portfolioResult, venuesResult, insightsResult] = results;
		if (portfolioResult.status === "fulfilled") {
			portfolio.value = portfolioResult.value || null;
			payloadSource.value.portfolio = portfolioResult.value?.source || "api";
			loadedCount += 1;
		} else {
			const msg = portfolioResult.reason?.message;
			if (msg && !isAuthOrTechError(msg)) notices.push(msg);
		}

		if (venuesResult.status === "fulfilled") {
			venues.value = Array.isArray(venuesResult.value?.venues)
				? venuesResult.value.venues
				: [];
			payloadSource.value.venues = venuesResult.value?.source || "api";
			loadedCount += 1;
		} else {
			const msg = venuesResult.reason?.message;
			if (msg && !isAuthOrTechError(msg)) notices.push(msg);
			venues.value = [];
		}

		if (insightsResult.status === "fulfilled") {
			insights.value = insightsResult.value || {
				trend: [],
				actions: [],
				expiring: [],
				summary: {},
			};
			payloadSource.value.insights = insightsResult.value?.source || "api";
			loadedCount += 1;
		} else {
			const msg = insightsResult.reason?.message;
			if (msg && !isAuthOrTechError(msg)) notices.push(msg);
			insights.value = {
				trend: [],
				actions: [],
				expiring: [],
				summary: {},
			};
		}

		if (loadedCount === 0) {
			throw new Error(t("ownerDashboard.load_failed"));
		}

		if (notices.length > 0) {
			dashboardNotice.value = [...new Set(notices)].join(" ");
		}
	} catch (error) {
		const msg = error?.message || "";
		dashboardError.value = isAuthOrTechError(msg)
			? "Service temporarily unavailable."
			: msg || t("ownerDashboard.load_failed");
		notifyError("Could not load Owner Dashboard. Please retry.");
	} finally {
		loading.value = false;
	}
};

const reloadInsights = async (nextDays) => {
	days.value = nextDays;
	await fetchDashboardData();
};

onMounted(() => {
	void fetchDashboardData();
});
</script>

<template>
  <div
    class="relative min-h-dvh w-full overflow-x-hidden px-4 pb-8 pt-20 text-white md:px-6 md:pt-24"
    data-testid="owner-dashboard-root"
  >
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#08091a]" aria-hidden="true">
      <div class="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-[100px]" />
      <div class="absolute -right-20 -top-16 h-80 w-80 rounded-full bg-cyan-500/20 blur-[100px]" />
      <div class="absolute bottom-[-180px] left-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-[110px]" />
    </div>

    <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 md:gap-5">
      <header
        class="relative overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.2),_transparent_34%),linear-gradient(145deg,rgba(3,7,18,0.96),rgba(8,15,32,0.92))] p-5 shadow-[0_28px_80px_rgba(2,8,23,0.5)] backdrop-blur-xl md:p-6"
        data-testid="owner-dashboard-hero"
      >
        <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(34,211,238,0.12),transparent_40%,rgba(14,165,233,0.08))]" />
        <div class="pointer-events-none absolute inset-y-0 right-0 w-[32rem] bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.18),_transparent_65%)]" />
        <div class="relative z-10 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div class="space-y-3">
            <p class="text-[11px] font-black uppercase tracking-[0.3em] text-white/55">{{ $t('auto.k_912f3194') }}</p>
            <h1 class="max-w-3xl text-2xl font-black leading-tight md:text-4xl">
              <span class="bg-gradient-to-r from-cyan-200 via-sky-300 to-emerald-200 bg-clip-text text-transparent">{{ $t('auto.k_1fd0f9d7') }}</span>
            </h1>
            <p class="max-w-2xl text-sm text-white/72 md:text-base">{{ $t('auto.k_97f32e4a') }}</p>
            <div class="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
              <span class="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">{{ t('ownerDashboard.promotion_cockpit') }}</span>
              <span v-if="topVenue" class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/75">
                {{ t('ownerDashboard.top_traffic_badge', { name: topVenue.name || t('ownerDashboard.generic_venue') }) }}
              </span>
              <span v-if="nextExpiryItem" class="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-amber-100">
                {{ t('ownerDashboard.next_expiry_badge', { feature: nextExpiryItem.feature }) }}
              </span>
            </div>
            <p class="break-all text-xs text-white/55 md:text-sm">
              {{ $t('auto.k_2aaa7eae') }}
              <span class="font-mono text-white/80">{{ visitorId || "-" }}</span>
            </p>
            <span
              class="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
              data-testid="owner-source-badge"
              :class="
                sourceBadge.mode === 'fallback'
                  ? 'border-amber-400/35 bg-amber-500/20 text-amber-200'
                  : 'border-emerald-400/35 bg-emerald-500/20 text-emerald-200'
              "
            >
              {{ sourceBadge.label }}
            </span>
          </div>

          <div class="grid gap-3 rounded-[26px] border border-white/10 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div class="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <p class="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">{{ t('ownerDashboard.best_next_push') }}</p>
                <p class="mt-2 truncate text-lg font-black text-white">
                  {{ promoteTargetVenue?.name || t('ownerDashboard.no_venue_yet') }}
                </p>
                <p class="mt-1 text-xs text-white/70">
                  {{
                    promoteTargetVenue
                      ? t('ownerDashboard.best_next_push_summary', {
                          quality: Number(promoteTargetVenue?.completeness?.score || 0),
                          views: formatNumber(promoteTargetVenue?.total_views || 0),
                        })
                      : t('ownerDashboard.first_venue_unlock')
                  }}
                </p>
              </div>

              <div class="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                <p class="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100/70">{{ t('ownerDashboard.needs_attention') }}</p>
                <p class="mt-2 text-lg font-black text-white">{{ formatNumber(needsWorkCount) }}</p>
                <p class="mt-1 text-xs text-white/70">{{ t('ownerDashboard.profile_readiness_hint') }}</p>
              </div>

              <div class="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                <p class="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">{{ t('ownerDashboard.next_expiry') }}</p>
                <p class="mt-2 truncate text-lg font-black text-white">
                  {{ nextExpiryItem?.venueName || t('ownerDashboard.nothing_urgent') }}
                </p>
                <p class="mt-1 text-xs text-white/70">
                  {{
                    nextExpiryItem
                      ? t('ownerDashboard.next_expiry_summary', {
                          feature: nextExpiryItem.feature,
                          date: formatDate(nextExpiryItem.at),
                        })
                      : t('ownerDashboard.promotion_slots_clear')
                  }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="promoteTargetVenue"
                class="rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:scale-[1.01] active:scale-[0.98]"
                @click="openPromote(promoteTargetVenue)"
              >
                {{ t('ownerDashboard.promote_named_venue', { name: promoteTargetVenue.name || t('ownerDashboard.generic_venue') }) }}
              </button>
              <button
                v-if="promoteTargetVenue"
                class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/85 transition hover:bg-white/10"
                @click="openEdit(promoteTargetVenue)"
              >
                {{ t('ownerDashboard.tune_listing') }}
              </button>
              <button
                v-for="d in [7, 30]"
                :key="d"
                class="rounded-xl border px-3 py-3 text-xs font-bold transition"
                :class="
                  days === d
                    ? 'border-cyan-300/50 bg-cyan-400/15 text-white shadow-lg shadow-cyan-950/30'
                    : 'border-white/10 bg-black/30 text-white/75 hover:bg-white/10'
                "
                @click="reloadInsights(d)"
              >
                {{ d }}d
              </button>
              <button
                class="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs font-bold text-white/80 transition hover:bg-white/10"
                @click="fetchDashboardData"
              >
                {{ t('ownerDashboard.refresh') }}
              </button>
              <button
                class="rounded-xl bg-gradient-to-r from-rose-600 to-cyan-600 px-3 py-3 text-xs font-black text-white shadow-lg shadow-rose-900/40 transition hover:scale-[1.02] active:scale-[0.98]"
                @click="safeExit"
              >
                {{ $t('auto.k_999dbe89') }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <section
        v-if="loading"
        class="rounded-2xl border border-white/10 bg-gray-900/85 p-4 shadow-2xl backdrop-blur-xl"
        :aria-label="$t('auto.k_21902d8b')"
      >
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div v-for="n in 6" :key="`owner-kpi-skeleton-${n}`" class="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
        </div>
        <div class="mt-4 h-52 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
      </section>

      <div v-else-if="dashboardError" class="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-100" role="alert">
        <p class="text-sm font-black uppercase tracking-wide text-red-300">{{ $t('auto.k_15365c2f') }}</p>
        <p class="mt-1 text-sm text-red-100/90">{{ dashboardError }}</p>
      </div>

      <template v-else>
        <div v-if="fallbackModules.length" class="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {{ fallbackNotice }}
          <strong>{{ fallbackModules.join(", ") }}</strong>
        </div>
        <div v-if="dashboardNotice" class="rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
          {{ dashboardNotice }}
        </div>

        <section
          class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
          :aria-label="$t('auto.k_20207130')"
          data-testid="owner-kpi-strip"
        >
          <article
            v-for="card in kpiCards"
            :key="card.label"
            class="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 shadow-xl"
          >
            <div class="absolute inset-0 bg-gradient-to-br opacity-70" :class="card.tone" />
            <div class="relative z-10">
              <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">{{ card.label }}</p>
              <p class="mt-2 text-xl font-black md:text-2xl">{{ card.value }}</p>
            </div>
          </article>
        </section>

        <section
          class="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.95fr]"
          data-testid="owner-command-deck"
        >
          <article class="relative overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(145deg,rgba(3,7,18,0.96),rgba(8,15,32,0.9))] p-5 shadow-2xl">
            <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_42%)]" />
            <div class="relative z-10">
              <p class="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200/70">{{ t('ownerDashboard.promote_shop_system') }}</p>
              <h2 class="mt-2 text-2xl font-black text-white md:text-3xl">
                {{
                  promoteTargetVenue
                    ? t('ownerDashboard.push_into_discovery', { name: promoteTargetVenue.name || t('ownerDashboard.your_next_venue') })
                    : t('ownerDashboard.build_first_listing')
                }}
              </h2>
              <p class="mt-2 max-w-2xl text-sm text-white/68 md:text-base">
                {{
                  promoteTargetVenue
                    ? t('ownerDashboard.workflow_copy')
                    : t('ownerDashboard.empty_workflow_copy')
                }}
              </p>

              <div class="mt-5 grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/55">{{ t('ownerDashboard.views') }}</p>
                  <p class="mt-2 text-2xl font-black text-white">
                    {{ formatNumber(promoteTargetVenue?.total_views || 0) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/55">{{ t('ownerDashboard.rating') }}</p>
                  <p class="mt-2 text-2xl font-black text-white">
                    {{ Number(promoteTargetVenue?.rating || 0).toFixed(1) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p class="text-[11px] font-black uppercase tracking-[0.2em] text-white/55">{{ t('ownerDashboard.profile_quality') }}</p>
                  <p class="mt-2 text-2xl font-black text-white">
                    {{ Number(promoteTargetVenue?.completeness?.score || 0) }}%
                  </p>
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <button
                  v-if="promoteTargetVenue"
                  class="rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-900/30 transition hover:scale-[1.01] active:scale-[0.98]"
                  @click="openPromote(promoteTargetVenue)"
                >
                  {{ t('ownerDashboard.open_promote_flow') }}
                </button>
                <button
                  v-if="promoteTargetVenue"
                  class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/85 transition hover:bg-white/10"
                  @click="openEdit(promoteTargetVenue)"
                >
                  {{ t('ownerDashboard.fix_listing_now') }}
                </button>
              </div>
            </div>
          </article>

          <div class="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
            <article class="rounded-[24px] border border-amber-400/20 bg-[linear-gradient(160deg,rgba(120,53,15,0.22),rgba(17,24,39,0.92))] p-4 shadow-xl">
              <p class="text-[11px] font-black uppercase tracking-[0.24em] text-amber-100/70">{{ t('ownerDashboard.expiry_watch') }}</p>
              <p class="mt-2 truncate text-xl font-black text-white">
                {{ nextExpiryItem?.venueName || t('ownerDashboard.all_clear') }}
              </p>
              <p class="mt-1 text-sm text-white/68">
                {{
                  nextExpiryItem
                    ? t('ownerDashboard.expiry_watch_summary', {
                        feature: nextExpiryItem.feature,
                        date: formatDate(nextExpiryItem.at),
                      })
                    : t('ownerDashboard.no_expiry_scheduled')
                }}
              </p>
            </article>

            <article class="rounded-[24px] border border-teal-400/20 bg-[linear-gradient(160deg,rgba(19,78,74,0.18),rgba(17,24,39,0.92))] p-4 shadow-xl">
              <p class="text-[11px] font-black uppercase tracking-[0.24em] text-teal-100/70">{{ t('ownerDashboard.top_performer') }}</p>
              <p class="mt-2 truncate text-xl font-black text-white">
                {{ topVenue?.name || t('ownerDashboard.no_top_venue') }}
              </p>
              <p class="mt-1 text-sm text-white/68">
                {{
                  topVenue
                    ? t('ownerDashboard.top_performer_summary', {
                        views: formatNumber(topVenue.total_views || 0),
                        rating: Number(topVenue.rating || 0).toFixed(1),
                      })
                    : t('ownerDashboard.top_performer_empty')
                }}
              </p>
            </article>

            <article class="rounded-[24px] border border-rose-400/20 bg-[linear-gradient(160deg,rgba(157,23,77,0.18),rgba(17,24,39,0.92))] p-4 shadow-xl">
              <p class="text-[11px] font-black uppercase tracking-[0.24em] text-rose-100/70">{{ t('ownerDashboard.quality_pressure') }}</p>
              <p class="mt-2 text-xl font-black text-white">{{ formatNumber(needsWorkCount) }}</p>
              <p class="mt-1 text-sm text-white/68">
                {{ t('ownerDashboard.quality_pressure_hint') }}
              </p>
            </article>
          </div>
        </section>

        <section
          class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl md:p-5"
          data-testid="owner-venue-panel"
        >
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-lg font-black text-white md:text-xl">{{ $t('auto.k_33ac197a') }}</h2>
              <p class="text-sm text-white/55">{{ filteredVenues.length }} results</p>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label class="md:col-span-1">
              <span class="sr-only">{{ $t('auto.k_a6567c3f') }}</span>
              <input :aria-label="$t('a11y.input_field')"
                v-model.trim="searchText"
                type="search"
                class="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition focus:border-blue-400"
                :placeholder="$t('auto.k_314a739d')"
              />
            </label>
            <label>
              <span class="sr-only">{{ $t('auto.k_81d2e3b6') }}</span>
              <select
                v-model="statusFilter"
                class="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition focus:border-blue-400"
              >
                <option value="all">{{ $t('auto.k_96e23776') }}</option>
                <option value="live">Live</option>
                <option value="promoted">Promoted</option>
                <option value="needs-work">{{ $t('auto.k_d9cf45d3') }}</option>
              </select>
            </label>
            <label>
              <span class="sr-only">{{ $t('auto.k_e64a63fe') }}</span>
              <select
                v-model="sortKey"
                class="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 transition focus:border-blue-400"
              >
                <option value="views">{{ $t('auto.k_5af1c930') }}</option>
                <option value="rating">{{ $t('auto.k_398a09d9') }}</option>
                <option value="completeness">{{ $t('auto.k_695f8a13') }}</option>
                <option value="updated">{{ $t('auto.k_8674d279') }}</option>
                <option value="live">{{ $t('auto.k_46f4cfd9') }}</option>
              </select>
            </label>
          </div>

          <ul class="mt-4 space-y-3 md:hidden" role="list">
            <li
              v-for="venue in filteredVenues"
              :key="venue.id"
              class="rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <div class="flex items-start gap-3">
                <img
                  v-if="venue.image"
                  :src="venue.image"
                  :alt="venue.name"
                  class="h-14 w-14 rounded-xl object-cover"
                  loading="lazy"
                />
                <div
                  v-else
                  class="flex h-14 w-14 items-center justify-center rounded-xl bg-black/40 text-lg font-black text-white/80"
                  aria-hidden="true"
                >
                  {{ (venue.name || "?").charAt(0).toUpperCase() }}
                </div>

                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-bold text-white">{{ venue.name || "Unnamed" }}</p>
                  <p class="text-xs text-white/55">{{ venue.category || "-" }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/75">
                    <span
                      class="rounded-full border px-2 py-0.5 font-bold uppercase"
                      :class="
                        venue.is_live
                          ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/20 bg-white/10 text-white/65'
                      "
                    >
                      {{ venue.status || "-" }}
                    </span>
                    <span>{{ $t('auto.k_cd15a811') }} {{ formatNumber(venue.total_views) }}</span>
                    <span>{{ $t('auto.k_686db27e') }} {{ Number(venue.rating || 0).toFixed(1) }}</span>
                    <span
                      class="rounded-full border px-2 py-0.5 font-bold"
                      :class="
                        Number(venue?.completeness?.score || 0) >= 70
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                          : 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                      "
                    >
                      {{ Number(venue?.completeness?.score || 0) }}%
                    </span>
                  </div>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2">
                <button
                  class="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-lg transition hover:scale-[1.01] active:scale-[0.98]"
                  @click="openPromote(venue)"
                >
                  {{ $t('auto.k_e51b60ed') }}
                </button>
                <button
                  class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                  @click="openEdit(venue)"
                >
                  Edit
                </button>
              </div>
            </li>
            <li
              v-if="filteredVenues.length === 0"
              class="rounded-xl border border-white/10 bg-black/30 p-4 text-center text-sm text-white/60"
            >
              {{ $t('auto.k_5ffd12cd') }}
            </li>
          </ul>

          <div class="mt-4 hidden overflow-hidden rounded-xl border border-white/10 bg-black/25 md:block">
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-white/5 text-[11px] uppercase tracking-[0.2em] text-white/55">
                  <tr>
                    <th class="px-4 py-3 text-left">Venue</th>
                    <th class="px-4 py-3 text-left">Status</th>
                    <th class="px-4 py-3 text-right">Views</th>
                    <th class="px-4 py-3 text-right">Rating</th>
                    <th class="px-4 py-3 text-left">Quality</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="venue in filteredVenues"
                    :key="`${venue.id}-desk`"
                    class="border-t border-white/10 text-white/85 hover:bg-white/5"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <img
                          v-if="venue.image"
                          :src="venue.image"
                          :alt="venue.name"
                          class="h-11 w-11 rounded-lg object-cover"
                          loading="lazy"
                        />
                        <div
                          v-else
                          class="flex h-11 w-11 items-center justify-center rounded-lg bg-black/40 text-base font-black text-white/70"
                          aria-hidden="true"
                        >
                          {{ (venue.name || "?").charAt(0).toUpperCase() }}
                        </div>
                        <div class="min-w-0">
                          <p class="truncate font-semibold text-white">{{ venue.name || "Unnamed" }}</p>
                          <p class="truncate text-xs text-white/55">{{ venue.category || "-" }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase"
                        :class="
                          venue.is_live
                            ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                            : 'border-white/20 bg-white/10 text-white/65'
                        "
                      >
                        {{ venue.status || "-" }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right font-medium">{{ formatNumber(venue.total_views) }}</td>
                    <td class="px-4 py-3 text-right font-medium">{{ Number(venue.rating || 0).toFixed(1) }}</td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                        :class="
                          Number(venue?.completeness?.score || 0) >= 70
                            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                            : 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                        "
                      >
                        {{ Number(venue?.completeness?.score || 0) }}%
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex justify-end gap-2">
                        <button
                          class="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-lg transition hover:scale-[1.01] active:scale-[0.98]"
                          @click="openPromote(venue)"
                        >
                          {{ $t('auto.k_e51b60ed') }}
                        </button>
                        <button
                          class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                          @click="openEdit(venue)"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredVenues.length === 0">
                    <td colspan="6" class="px-4 py-6 text-center text-sm text-white/55">{{ $t('auto.k_5ffd12cd') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="owner-insights-grid">
          <article class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <h3 class="text-lg font-black text-white">{{ $t('auto.k_76befe71') }}</h3>
            <p class="mt-1 text-sm text-white/55">{{ $t('auto.k_444a80f8') }}</p>
            <ul class="mt-4 space-y-2">
              <li
                v-for="row in expiryTimeline"
                :key="`${row.venueId}-${row.feature}-${row.at}`"
                class="flex items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <div class="mt-1 h-2.5 w-2.5 rounded-full bg-blue-300" aria-hidden="true" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-white">{{ row.venueName }} | {{ row.feature }}</p>
                  <p class="text-xs text-white/60">{{ formatDate(row.at) }}</p>
                </div>
              </li>
              <li
                v-if="expiryTimeline.length === 0"
                class="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/55"
              >
                {{ $t('auto.k_51f00314') }}
              </li>
            </ul>
          </article>

          <article class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <h3 class="text-lg font-black text-white">{{ $t('auto.k_36db2343') }}</h3>
            <p class="mt-1 text-sm text-white/55">{{ $t('auto.k_7512e171') }}</p>
            <ul class="mt-4 space-y-2">
              <li
                v-for="[key, label] in [
                  ['image', 'Cover image'],
                  ['open_time', 'Opening hours'],
                  ['category', 'Category'],
                  ['social', 'Social links'],
                  ['pin', 'Pin type'],
                ]"
                :key="key"
                class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <span class="text-sm text-white/80">{{ label }}</span>
                <span
                  class="rounded-full border px-2 py-1 text-[11px] font-bold"
                  :class="
                    qualitySummary[key] > 0
                      ? 'border-amber-500/40 bg-amber-500/20 text-amber-200'
                      : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                  "
                >
                  {{
                    qualitySummary[key] > 0
                      ? `${formatNumber(qualitySummary[key])} missing`
                      : 'OK - All set'
                  }}
                </span>
              </li>
            </ul>
          </article>

          <article class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <h3 class="text-lg font-black text-white">{{ $t('auto.k_601ae409') }}</h3>
            <ul class="mt-4 space-y-2">
              <li
                v-for="(action, i) in growthActions"
                :key="`${action.type}-${i}`"
                class="rounded-xl border p-3"
                :class="{
                  'border-red-500/30 bg-red-500/10': action.priority === 'high',
                  'border-amber-500/30 bg-amber-500/10': action.priority === 'medium',
                  'border-white/10 bg-black/30': action.priority !== 'high' && action.priority !== 'medium',
                }"
              >
                <p class="text-sm font-bold text-white">{{ action.label }}</p>
                <p class="mt-1 text-xs text-white/70">{{ action.description }}</p>
                <span
                  class="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase"
                  :class="{
                    'border-red-500/40 bg-red-500/20 text-red-200': action.priority === 'high',
                    'border-amber-500/40 bg-amber-500/20 text-amber-200': action.priority === 'medium',
                    'border-white/15 bg-white/10 text-white/70': !action.priority || action.priority === 'normal',
                  }"
                >
                  {{ action.priority || 'normal' }}
                </span>
              </li>
              <li
                v-if="growthActions.length === 0"
                class="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/55"
              >
                {{ $t('auto.k_bf22d9ce') }}
              </li>
            </ul>
          </article>

          <article class="rounded-2xl border border-white/10 bg-gray-900/90 p-4 shadow-2xl backdrop-blur-xl">
            <h3 class="text-lg font-black text-white">{{ $t('auto.k_df2efd04') }}{{ days }}{{ $t('auto.k_a01d39ae') }}</h3>
            <p class="mt-1 text-sm text-white/55">
              {{ formatNumber(insights.summary?.events_total) }} {{ $t('auto.k_5ab9bef0') }} {{ formatNumber(insights.summary?.unique_visitors_total) }} visitors
            </p>
            <ul class="mt-4 space-y-2">
              <li
                v-for="row in trendRows"
                :key="row.date"
                class="rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <div class="flex items-center justify-between text-xs text-white/70">
                  <span>{{ row.date }}</span>
                  <span class="font-bold text-white">{{ formatNumber(row.events) }}</span>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
                    :style="{
                      width: `${Math.max(2, Math.round((Number(row.events || 0) / trendMax) * 100))}%`,
                    }"
                    role="progressbar"
                    :aria-valuenow="Number(row.events || 0)"
                    :aria-label="`${row.date}: ${row.events} events`"
                  />
                </div>
                <div class="mt-2 flex items-center justify-between text-[11px] text-white/60">
                  <span>{{ formatNumber(row.active_venues) }} venues</span>
                  <span>{{ formatNumber(row.unique_visitors) }} visitors</span>
                </div>
              </li>
            </ul>
          </article>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <div role="button" tabindex="0"
        v-if="promotingVenue"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        data-testid="owner-promote-modal"
        @click.self="closePromote"
      >
        <div class="relative w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gray-900/95 shadow-2xl">
          <button
            class="absolute right-3 top-3 z-20 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/10"
            @click="closePromote"
            :aria-label="$t('auto.k_3079324d')"
          >
            Close
          </button>
          <div class="max-h-[90vh] overflow-y-auto p-4 pt-12 md:p-6">
            <BuyPinsPanel :shop-id="promotingVenue.id" />
          </div>
        </div>
      </div>
    </Teleport>

    <EditVenueModal
      v-if="editingVenue"
      :venue="editingVenue"
      @close="closeEdit"
    />
  </div>
</template>
