<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotifications } from "@/composables/useNotifications";
import { ownerService } from "../../services/ownerService";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
} from "../../services/visitorIdentity";
import EditVenueModal from "../modal/EditVenueModal.vue";
import BuyPinsPanel from "./BuyPinsPanel.vue";

const router = useRouter();
const { notifyError } = useNotifications();

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
	const hasFallback = values.includes("supabase_fallback");
	return {
		mode: hasFallback ? "fallback" : "api",
		label: hasFallback ? "Fallback mode (Supabase)" : "Live API mode",
	};
});

const fallbackModules = computed(() =>
	Object.entries(payloadSource.value)
		.filter(([, value]) => value === "supabase_fallback")
		.map(([key]) => key),
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
		tone: "from-fuchsia-500/25 to-violet-600/20",
	},
	{
		label: "Rating",
		value: Number(kpis.value.avg_rating || 0).toFixed(2),
		tone: "from-purple-400/25 to-orange-600/20",
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

const safeExit = async () => {
	try {
		await router.push("/");
	} catch {
		window.location.href = "/";
	}
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
			notices.push(portfolioResult.reason?.message || "Portfolio unavailable.");
		}

		if (venuesResult.status === "fulfilled") {
			venues.value = Array.isArray(venuesResult.value?.venues)
				? venuesResult.value.venues
				: [];
			payloadSource.value.venues = venuesResult.value?.source || "api";
			loadedCount += 1;
		} else {
			notices.push(venuesResult.reason?.message || "Venues unavailable.");
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
			notices.push(insightsResult.reason?.message || "Insights unavailable.");
			insights.value = {
				trend: [],
				actions: [],
				expiring: [],
				summary: {},
			};
		}

		if (loadedCount === 0) {
			throw new Error(notices.join(" ") || "Failed to load owner dashboard.");
		}

		if (notices.length > 0) {
			dashboardNotice.value = [...new Set(notices)].join(" ");
		}
	} catch (error) {
		dashboardError.value = error?.message || "Failed to load owner dashboard.";
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
  <div class="od-root" data-testid="owner-dashboard-root">
    <div class="od-bg" aria-hidden="true">
      <div class="od-bg-glow od-bg-glow--purple" />
      <div class="od-bg-glow od-bg-glow--indigo" />
      <div class="od-bg-glow od-bg-glow--rose" />
    </div>

    <div class="od-container">
      <!-- ── Sticky Header ──────────────────────────────────── -->
      <header class="od-hero" data-testid="owner-dashboard-hero">
        <div class="od-hero-left">
          <p class="od-eyebrow">VibeCity Owner Console</p>
          <h1 class="od-hero-title">Venue Command Center</h1>
          <p class="od-hero-sub break-all">
            ID: <span class="od-hero-id">{{ visitorId || "–" }}</span>
          </p>
          <span
            class="od-source-badge"
            :class="
              sourceBadge.mode === 'fallback'
                ? 'od-source-badge--warn'
                : 'od-source-badge--ok'
            "
            >{{ sourceBadge.label }}</span
          >
        </div>
        <div class="od-hero-actions">
          <button
            v-for="d in [7, 30]"
            :key="d"
            class="od-chip"
            :class="{ 'od-chip--active': days === d }"
            @click="reloadInsights(d)"
          >
            {{ d }}d
          </button>
          <button class="od-chip" @click="fetchDashboardData">Refresh</button>
          <button class="od-btn od-btn--exit" @click="safeExit">Exit Dashboard</button>
        </div>
      </header>

      <!-- ── Loading skeleton ───────────────────────────────── -->
      <section
        v-if="loading"
        class="od-skeleton-wrap"
        aria-label="Loading dashboard"
      >
        <div class="od-skeleton-strip">
          <div v-for="n in 6" :key="n" class="od-skeleton od-skeleton--kpi" />
        </div>
        <div class="od-skeleton od-skeleton--wide" />
      </section>

      <!-- ── Error state ─────────────────────────────────────── -->
      <div v-else-if="dashboardError" class="od-error-panel" role="alert">
        <p class="od-error-title">Alert: Dashboard Error</p>
        <p class="od-error-body">{{ dashboardError }}</p>
      </div>

      <template v-else>
        <!-- ── Notices ─────────────────────────────────────── -->
        <div v-if="fallbackModules.length" class="od-notice od-notice--warn">
          Running fallback mode for:
          <strong>{{ fallbackModules.join(", ") }}</strong>
        </div>
        <div v-if="dashboardNotice" class="od-notice od-notice--info">
          {{ dashboardNotice }}
        </div>

        <!-- ── KPI Strip ──────────────────────────────────── -->
        <section class="od-kpi-strip" aria-label="Key performance indicators">
          <article v-for="card in kpiCards" :key="card.label" class="od-kpi">
            <p class="od-kpi-label">{{ card.label }}</p>
            <p class="od-kpi-value" :class="card.tone">
              {{ card.value }}
            </p>
          </article>
        </section>

        <!-- ── Venue Panel ────────────────────────────────── -->
        <section class="od-panel">
          <div class="od-panel-header">
            <div>
              <h2 class="od-panel-title">Your Venues</h2>
              <p class="od-panel-sub">{{ filteredVenues.length }} results</p>
            </div>
          </div>

          <!-- Filters -->
          <div class="od-filters">
            <label class="od-filter-wrap od-filter-wrap--grow">
              <span class="sr-only">Search venues</span>
              <input
                v-model.trim="searchText"
                type="search"
                class="od-field"
                placeholder="Search venue or category..."
              />
            </label>
            <label class="od-filter-wrap">
              <span class="sr-only">Filter by status</span>
              <select v-model="statusFilter" class="od-field">
                <option value="all">All Status</option>
                <option value="live">Live</option>
                <option value="promoted">Promoted</option>
                <option value="needs-work">Needs Work</option>
              </select>
            </label>
            <label class="od-filter-wrap">
              <span class="sr-only">Sort by</span>
              <select v-model="sortKey" class="od-field">
                <option value="views">Views ↓</option>
                <option value="rating">Rating ↓</option>
                <option value="completeness">Quality ↓</option>
                <option value="updated">Updated ↓</option>
                <option value="live">Live First</option>
              </select>
            </label>
          </div>

          <!-- Mobile card list (<768px) -->
          <ul class="od-card-list" role="list">
            <li
              v-for="venue in filteredVenues"
              :key="venue.id"
              class="od-venue-card"
            >
              <div class="od-venue-card-row">
                <img
                  v-if="venue.image"
                  :src="venue.image"
                  :alt="venue.name"
                  class="od-venue-thumb"
                  loading="lazy"
                />
                <div
                  v-else
                  class="od-venue-thumb od-venue-thumb--placeholder"
                  aria-hidden="true"
                >
                  {{ (venue.name || "?").charAt(0).toUpperCase() }}
                </div>
                <div class="od-venue-info">
                  <p class="od-venue-name">{{ venue.name || "Unnamed" }}</p>
                  <p class="od-venue-cat">{{ venue.category || "–" }}</p>
                  <div class="od-venue-meta">
                    <span
                      class="od-status-chip"
                      :class="
                        venue.is_live
                          ? 'od-status-chip--live'
                          : 'od-status-chip--off'
                      "
                      >{{ venue.status || "–" }}</span
                    >
                    <span class="od-meta-stat"
                      >Views: {{ formatNumber(venue.total_views) }}</span
                    >
                    <span class="od-meta-stat"
                      >Rating: {{ Number(venue.rating || 0).toFixed(1) }}</span
                    >
                    <span
                      class="od-score"
                      :class="
                        Number(venue?.completeness?.score || 0) >= 70
                          ? 'od-score--good'
                          : 'od-score--warn'
                      "
                      >{{ Number(venue?.completeness?.score || 0) }}%</span
                    >
                  </div>
                </div>
              </div>
              <div class="od-venue-card-actions">
                <button
                  class="od-btn od-btn--promote"
                  @click="openPromote(venue)"
                >
                  Promote Shop
                </button>
                <button class="od-btn od-btn--edit" @click="openEdit(venue)">
                  Edit
                </button>
              </div>
            </li>
            <li v-if="filteredVenues.length === 0" class="od-card-empty">
              No venues match current filters.
            </li>
          </ul>

          <!-- Desktop table (≥768px) -->
          <div class="od-table-scroll">
            <table class="od-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Status</th>
                  <th>Views</th>
                  <th>Rating</th>
                  <th>Quality</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="venue in filteredVenues" :key="venue.id + '-desk'">
                  <td>
                    <div class="od-venue-cell">
                      <img
                        v-if="venue.image"
                        :src="venue.image"
                        :alt="venue.name"
                        class="od-venue-thumb"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="od-venue-thumb od-venue-thumb--placeholder"
                        aria-hidden="true"
                      >
                        {{ (venue.name || "?").charAt(0).toUpperCase() }}
                      </div>
                      <div>
                        <p class="od-venue-name">
                          {{ venue.name || "Unnamed" }}
                        </p>
                        <p class="od-venue-cat">{{ venue.category || "–" }}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      class="od-status-chip"
                      :class="
                        venue.is_live
                          ? 'od-status-chip--live'
                          : 'od-status-chip--off'
                      "
                      >{{ venue.status || "–" }}</span
                    >
                  </td>
                  <td class="od-num">{{ formatNumber(venue.total_views) }}</td>
                  <td class="od-num">
                    {{ Number(venue.rating || 0).toFixed(1) }}
                  </td>
                  <td>
                    <span
                      class="od-score"
                      :class="
                        Number(venue?.completeness?.score || 0) >= 70
                          ? 'od-score--good'
                          : 'od-score--warn'
                      "
                      >{{ Number(venue?.completeness?.score || 0) }}%</span
                    >
                  </td>
                  <td>
                    <div class="od-row-actions">
                      <button
                        class="od-btn od-btn--promote"
                        @click="openPromote(venue)"
                      >
                        Promote Shop
                      </button>
                      <button
                        class="od-btn od-btn--edit"
                        @click="openEdit(venue)"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredVenues.length === 0">
                  <td colspan="6" class="od-table-empty">
                    No venues match current filters.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ── Insights Row ───────────────────────────────── -->
        <div class="od-insights-grid">
          <!-- Expiry Timeline -->
          <article class="od-panel">
            <h3 class="od-panel-title">Expiry Timeline</h3>
            <p class="od-panel-sub">Verified | Glow | Boost | Giant</p>
            <ul class="od-timeline-list">
              <li
                v-for="row in expiryTimeline"
                :key="`${row.venueId}-${row.feature}-${row.at}`"
                class="od-timeline-item"
              >
                <div class="od-timeline-dot" aria-hidden="true" />
                <div>
                  <p class="od-timeline-name">
                    {{ row.venueName }} | {{ row.feature }}
                  </p>
                  <p class="od-timeline-date">{{ formatDate(row.at) }}</p>
                </div>
              </li>
              <li v-if="expiryTimeline.length === 0" class="od-empty-item">
                No expiring items.
              </li>
            </ul>
          </article>

          <!-- Content Quality -->
          <article class="od-panel">
            <h3 class="od-panel-title">Content Quality</h3>
            <p class="od-panel-sub">Missing fields blocking discovery</p>
            <ul class="od-quality-list">
              <li
                v-for="[key, label] in [
                  ['image', 'Cover image'],
                  ['open_time', 'Opening hours'],
                  ['category', 'Category'],
                  ['social', 'Social links'],
                  ['pin', 'Pin type'],
                ]"
                :key="key"
                class="od-quality-item"
              >
                <span class="od-quality-label">{{ label }}</span>
                <span
                  class="od-quality-count"
                  :class="
                    qualitySummary[key] > 0
                      ? 'od-quality-count--warn'
                      : 'od-quality-count--ok'
                  "
                >
                  {{
                    qualitySummary[key] > 0
                      ? `${formatNumber(qualitySummary[key])} missing`
                      : "OK - All set"
                  }}
                </span>
              </li>
            </ul>
          </article>

          <!-- Growth Actions -->
          <article class="od-panel">
            <h3 class="od-panel-title">Growth Actions</h3>
            <ul class="od-actions-list">
              <li
                v-for="(action, i) in growthActions"
                :key="`${action.type}-${i}`"
                class="od-action-item"
                :class="{
                  'od-action-item--high': action.priority === 'high',
                  'od-action-item--medium': action.priority === 'medium',
                }"
              >
                <p class="od-action-label">{{ action.label }}</p>
                <p class="od-action-desc">{{ action.description }}</p>
                <span
                  class="od-priority-tag od-priority-tag--{{ action.priority || 'normal' }}"
                  >{{ action.priority || "normal" }}</span
                >
              </li>
              <li v-if="growthActions.length === 0" class="od-empty-item">
                No immediate actions.
              </li>
            </ul>
          </article>

          <!-- Activity Chart -->
          <article class="od-panel">
            <h3 class="od-panel-title">Activity ({{ days }}d)</h3>
            <p class="od-panel-sub">
              {{ formatNumber(insights.summary?.events_total) }} events |
              {{ formatNumber(insights.summary?.unique_visitors_total) }}
              visitors
            </p>
            <ul class="od-trend-list">
              <li
                v-for="row in trendRows"
                :key="row.date"
                class="od-trend-item"
              >
                <div class="od-trend-header">
                  <span class="od-trend-date">{{ row.date }}</span>
                  <span class="od-trend-val">{{
                    formatNumber(row.events)
                  }}</span>
                </div>
                <div class="od-trend-track">
                  <div
                    class="od-trend-fill"
                    :style="{
                      width: `${Math.max(2, Math.round((Number(row.events || 0) / trendMax) * 100))}%`,
                    }"
                    role="progressbar"
                    :aria-valuenow="Number(row.events || 0)"
                    :aria-label="`${row.date}: ${row.events} events`"
                  />
                </div>
                <div class="od-trend-footer">
                  <span>{{ formatNumber(row.active_venues) }} venues</span>
                  <span>{{ formatNumber(row.unique_visitors) }} visitors</span>
                </div>
              </li>
            </ul>
          </article>
        </div>
      </template>
    </div>

    <!-- ── Modals ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="promotingVenue"
        class="od-modal-backdrop"
        data-testid="owner-promote-modal"
        @click.self="closePromote"
      >
        <div class="od-modal-inner">
          <button
            class="od-modal-close"
            @click="closePromote"
            aria-label="Close promote panel"
          >
            Close
          </button>
          <BuyPinsPanel :shop-id="promotingVenue.id" />
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

<style scoped>
/* ── Root & Background ───────────────────────────────────────── */
.od-root {
  position: relative;
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  padding: 16px;
  padding-top: 80px;
  color: #fff;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

@media (min-width: 768px) {
  .od-root {
    padding: 24px;
    padding-top: 88px;
  }
}

.od-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: #08091a;
  overflow: hidden;
}

.od-bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
  will-change: transform;
  transform: translateZ(0);
}

.od-bg-glow--purple {
  width: 560px;
  height: 560px;
  top: -160px;
  left: -80px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.4), transparent);
}

.od-bg-glow--indigo {
  width: 480px;
  height: 480px;
  top: -80px;
  right: -80px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.4), transparent);
}

.od-bg-glow--rose {
  width: 640px;
  height: 640px;
  bottom: -200px;
  right: 0;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent);
}

/* ── Container ───────────────────────────────────────────────── */
.od-container {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Hero / Header ───────────────────────────────────────────── */
.od-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(255 255 255 / 0.09);
  background:
    linear-gradient(140deg, rgba(18 18 28 / 0.95), rgba(8 8 16 / 0.9)),
    linear-gradient(120deg, rgba(139, 92, 246, 0.06), rgba(59, 130, 246, 0.06));
  backdrop-filter: blur(20px);
}

.od-eyebrow {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(167, 139, 250, 0.85);
  font-weight: 700;
  margin-bottom: 5px;
}

.od-hero-title {
  font-size: clamp(1.35rem, 4vw, 1.9rem);
  font-weight: 900;
  letter-spacing: -0.025em;
  line-height: 1.1;
  color: #fff;
  margin-bottom: 5px;
}

.od-hero-sub {
  font-size: 0.72rem;
  color: rgba(255 255 255 / 0.45);
  margin-bottom: 8px;
}

.od-hero-id {
  color: rgba(167, 139, 250, 0.8);
  font-weight: 600;
}

.od-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* ── Source Badge ────────────────────────────────────────────── */
.od-source-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.od-source-badge--ok {
  background: rgba(34 197 94 / 0.12);
  border: 1px solid rgba(34 197 94 / 0.25);
  color: #86efac;
}

.od-source-badge--warn {
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
}

/* ── Chips ────────────────────────────────────────────────────── */
.od-chip {
  padding: 9px 16px;
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255 255 255 / 0.13);
  background: rgba(255 255 255 / 0.04);
  font-size: 0.75rem;
  font-weight: 800;
  color: rgba(255 255 255 / 0.7);
  transition:
    background 0.15s,
    color 0.15s,
    transform 0.1s;
  touch-action: manipulation;
}

.od-chip:hover {
  background: rgba(255 255 255 / 0.1);
  color: #fff;
}
.od-chip:active {
  transform: scale(0.96);
}

.od-chip--active {
  border-color: rgba(139, 92, 246, 0.45);
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.od-btn--exit {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  border-width: 1px;
  border-style: solid;
  font-weight: 900;
  margin-left: auto;
  cursor: pointer;
  transition: all 0.2s;
}
.od-btn--exit:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fef2f2;
}

/* ── Notices ─────────────────────────────────────────────────── */
.od-notice {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 0.82rem;
}

.od-notice--warn {
  background: rgba(245 158 11 / 0.08);
  border: 1px solid rgba(245 158 11 / 0.22);
  color: #fde68a;
}

.od-notice--info {
  background: rgba(20 184 166 / 0.08);
  border: 1px solid rgba(20 184 166 / 0.22);
  color: #99f6e4;
}

/* ── KPI Strip ───────────────────────────────────────────────── */
.od-kpi-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}

.od-kpi-strip::-webkit-scrollbar {
  display: none;
}

@media (min-width: 1024px) {
  .od-kpi-strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    overflow: visible;
  }
}

.od-kpi {
  flex: 0 0 140px;
  scroll-snap-align: start;
  border: 1px solid rgba(255 255 255 / 0.09);
  border-radius: 16px;
  padding: 16px;
  background: rgba(255 255 255 / 0.03);
  min-width: 140px;
}

@media (min-width: 1024px) {
  .od-kpi {
    flex: initial;
    min-width: 0;
  }
}

.od-kpi-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(255 255 255 / 0.5);
  margin-bottom: 10px;
  font-weight: 700;
}

.od-kpi-value {
  font-size: 1.6rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.025em;
  line-height: 1;
}

/* ── Panel ───────────────────────────────────────────────────── */
.od-panel {
  border: 1px solid rgba(255 255 255 / 0.08);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255 255 255 / 0.02);
  backdrop-filter: blur(12px);
}

.od-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.od-panel-title {
  font-size: 1rem;
  font-weight: 900;
  color: #fff;
  margin-bottom: 2px;
}

.od-panel-sub {
  font-size: 0.72rem;
  color: rgba(255 255 255 / 0.4);
  margin-bottom: 12px;
}

/* ── Filters ─────────────────────────────────────────────────── */
.od-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.od-filter-wrap {
  display: flex;
  flex-direction: column;
}
.od-filter-wrap--grow {
  flex: 1 1 150px;
  min-width: 0;
}

.od-field {
  border: 1px solid rgba(255 255 255 / 0.11);
  background: rgba(255 255 255 / 0.04);
  border-radius: 10px;
  padding: 11px 14px;
  min-height: 44px;
  color: #fff;
  font-size: 0.84rem;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  -webkit-appearance: none;
  appearance: none;
}

.od-field:focus-visible {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15);
}

.od-field::placeholder {
  color: rgba(255 255 255 / 0.28);
}

/* ── Mobile Card List (hidden on ≥768px) ───────────────────── */
.od-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 0;
}

@media (min-width: 768px) {
  .od-card-list {
    display: none;
  }
}

.od-venue-card {
  border: 1px solid rgba(255 255 255 / 0.08);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255 255 255 / 0.02);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: background 0.12s;
}

.od-venue-card:active {
  background: rgba(255 255 255 / 0.04);
}

.od-venue-card-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.od-venue-info {
  flex: 1;
  min-width: 0;
}

.od-venue-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.od-meta-stat {
  font-size: 11px;
  color: rgba(255 255 255 / 0.55);
  font-weight: 600;
}

.od-venue-card-actions {
  display: flex;
  gap: 8px;
}

.od-venue-card-actions .od-btn {
  flex: 1;
  justify-content: center;
  min-height: 44px;
  font-size: 13px;
}

.od-card-empty {
  padding: 24px;
  text-align: center;
  color: rgba(255 255 255 / 0.38);
  font-size: 0.84rem;
}

/* ── Desktop Table (hidden on <768px) ───────────────────────── */
.od-table-scroll {
  display: none;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255 255 255 / 0.08) transparent;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 768px) {
  .od-table-scroll {
    display: block;
  }
}

.od-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.od-table thead tr th {
  padding: 8px 12px;
  text-align: left;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(255 255 255 / 0.35);
  border-bottom: 1px solid rgba(255 255 255 / 0.07);
}

.od-table tbody tr {
  border-bottom: 1px solid rgba(255 255 255 / 0.04);
  transition: background 0.12s;
}

.od-table tbody tr:hover {
  background: rgba(255 255 255 / 0.025);
}
.od-table td {
  padding: 12px;
  vertical-align: middle;
}
.od-table-empty {
  text-align: center;
  padding: 28px;
  color: rgba(255 255 255 / 0.35);
  font-size: 0.85rem;
}

/* ── Venue Cell ──────────────────────────────────────────────── */
.od-venue-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.od-venue-thumb {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255 255 255 / 0.05);
}

.od-venue-thumb--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 900;
  color: rgba(255 255 255 / 0.35);
  background: linear-gradient(
    135deg,
    rgba(139, 92, 246, 0.15),
    rgba(20 184 166 / 0.15)
  );
}

.od-venue-name {
  font-size: 0.875rem;
  font-weight: 800;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.od-venue-cat {
  font-size: 10px;
  color: rgba(255 255 255 / 0.4);
  margin-top: 2px;
}

.od-num {
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
  text-align: right;
}

/* ── Status & Score Chips ────────────────────────────────────── */
.od-status-chip {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.od-status-chip--live {
  background: rgba(34 197 94 / 0.15);
  border: 1px solid rgba(34 197 94 / 0.28);
  color: #86efac;
}

.od-status-chip--off {
  background: rgba(255 255 255 / 0.05);
  border: 1px solid rgba(255 255 255 / 0.1);
  color: rgba(255 255 255 / 0.45);
}

.od-score {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
}

.od-score--good {
  background: rgba(34 197 94 / 0.12);
  color: #86efac;
}
.od-score--warn {
  background: rgba(139, 92, 246, 0.12);
  color: #c4b5fd;
}

/* ── Action Buttons ──────────────────────────────────────────── */
.od-row-actions {
  display: flex;
  gap: 6px;
}

.od-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  min-height: 36px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 800;
  transition:
    filter 0.15s,
    transform 0.1s;
  touch-action: manipulation;
  white-space: nowrap;
}

.od-btn:active {
  transform: scale(0.95);
}

/* Purple-Gold Promote (🚫 Purple Ban — no purple here) */
.od-btn--promote {
  background: linear-gradient(90deg, #8b5cf6, #3b82f6);
  color: #1c0a00;
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.3);
}

.od-btn--promote:hover {
  filter: brightness(1.08);
}

.od-btn--edit {
  background: rgba(255 255 255 / 0.07);
  border: 1px solid rgba(255 255 255 / 0.13);
  color: rgba(255 255 255 / 0.8);
}

.od-btn--edit:hover {
  background: rgba(255 255 255 / 0.12);
}

/* ── Insights Grid ───────────────────────────────────────────── */
.od-insights-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .od-insights-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* ── Timeline ────────────────────────────────────────────────── */
.od-timeline-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.od-timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255 255 255 / 0.06);
  background: rgba(255 255 255 / 0.02);
}

.od-timeline-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a78bfa;
  margin-top: 5px;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
}

.od-timeline-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: #fff;
}
.od-timeline-date {
  font-size: 10px;
  color: rgba(255 255 255 / 0.4);
  margin-top: 1px;
}

/* ── Content Quality ─────────────────────────────────────────── */
.od-quality-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.od-quality-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255 255 255 / 0.06);
  background: rgba(255 255 255 / 0.02);
}

.od-quality-label {
  font-size: 0.85rem;
  color: rgba(255 255 255 / 0.75);
}

.od-quality-count {
  font-size: 0.82rem;
  font-weight: 900;
}

.od-quality-count--warn {
  color: #c4b5fd;
}
.od-quality-count--ok {
  color: #86efac;
}

/* ── Growth Actions ──────────────────────────────────────────── */
.od-actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.od-action-item {
  padding: 12px 14px;
  border-radius: 11px;
  border-left: 3px solid rgba(255 255 255 / 0.1);
  background: rgba(255 255 255 / 0.02);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.od-action-item--high {
  border-left-color: #f87171;
  background: rgba(239 68 68 / 0.05);
}

.od-action-item--medium {
  border-left-color: #fb923c;
  background: rgba(251 146 60 / 0.05);
}

.od-action-label {
  font-size: 0.84rem;
  font-weight: 800;
  color: #fff;
}
.od-action-desc {
  font-size: 0.75rem;
  color: rgba(255 255 255 / 0.5);
}

.od-priority-tag {
  display: inline-block;
  width: fit-content;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  background: rgba(255 255 255 / 0.07);
  color: rgba(255 255 255 / 0.45);
}

/* ── Trend / Activity ────────────────────────────────────────── */
.od-trend-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.od-trend-item {
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255 255 255 / 0.05);
  background: rgba(255 255 255 / 0.02);
}

.od-trend-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.od-trend-date {
  font-size: 10px;
  color: rgba(255 255 255 / 0.5);
}
.od-trend-val {
  font-size: 10px;
  font-weight: 800;
  color: #fff;
}

.od-trend-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255 255 255 / 0.07);
  overflow: hidden;
  margin-bottom: 5px;
}

.od-trend-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #8b5cf6, #3b82f6);
  transition: width 0.4s ease;
}

.od-trend-footer {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: rgba(255 255 255 / 0.38);
}

/* ── Modals ──────────────────────────────────────────────────── */
.od-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0 0 0 / 0.88);
  backdrop-filter: blur(10px);
}

.od-modal-inner {
  position: relative;
  width: 100%;
  max-width: 1200px;
  border-radius: 24px;
  overflow: hidden;
}

.od-modal-close {
  position: absolute;
  top: -38px;
  right: 0;
  font-size: 0.85rem;
  color: rgba(255 255 255 / 0.6);
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Skeleton Loading ────────────────────────────────────────── */
.od-skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.od-skeleton-strip {
  display: flex;
  gap: 10px;
  overflow: hidden;
}

.od-skeleton {
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    rgba(255 255 255 / 0.03) 20%,
    rgba(255 255 255 / 0.08) 50%,
    rgba(255 255 255 / 0.03) 80%
  );
  background-size: 220% 100%;
  animation: od-shimmer 1.6s linear infinite;
}

.od-skeleton--kpi {
  height: 80px;
  flex: 0 0 140px;
  min-width: 140px;
}
.od-skeleton--wide {
  height: 220px;
}

@keyframes od-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -20% 0;
  }
}

/* ── Error & Empty ───────────────────────────────────────────── */
.od-error-panel {
  padding: 20px;
  border-radius: 14px;
  border: 1px solid rgba(239 68 68 / 0.3);
  background: rgba(239 68 68 / 0.08);
}

.od-error-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #fca5a5;
  margin-bottom: 4px;
}
.od-error-body {
  font-size: 0.82rem;
  color: rgba(252 165 165 / 0.8);
}
.od-empty-item {
  padding: 12px;
  font-size: 0.82rem;
  color: rgba(255 255 255 / 0.35);
}

/* ── Accessibility ───────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .od-skeleton {
    animation: none;
  }
  .od-trend-fill,
  .od-chip,
  .od-btn,
  .od-field,
  .od-table tbody tr {
    transition: none;
  }
}
</style>
