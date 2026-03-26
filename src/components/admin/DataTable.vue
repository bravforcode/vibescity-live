<template>
  <div class="admin-data-table flex flex-col gap-4 w-full">
    <!-- Controls bar -->
    <div class="flex flex-wrap items-center gap-3 w-full">
      <input
        v-if="searchable"
        v-model="searchQuery"
        type="search"
        :placeholder="searchPlaceholder"
        class="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        @input="debouncedFetch"
      />

      <select
        v-model="currentPageSize"
        class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        @change="fetchData"
      >
        <option :value="10">10 rows</option>
        <option :value="25">25 rows</option>
        <option :value="50">50 rows</option>
        <option :value="100">100 rows</option>
      </select>

      <button
        v-if="exportable"
        class="px-3 py-2 bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg text-sm font-medium transition-colors"
        @click="exportCSV"
      >
        <div class="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Export CSV
        </div>
      </button>

      <slot name="controls" />
    </div>

    <!-- Filters slot -->
    <div
      v-if="$slots.filters"
      class="flex flex-wrap items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
    >
      <slot name="filters" />
    </div>

    <!-- Loading / Error / Empty -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-800 rounded-xl border border-slate-700 min-h-[300px]"
    >
      <svg
        class="animate-spin h-8 w-8 text-blue-500 mb-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      Loading data...
    </div>

    <div
      v-else-if="error"
      class="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        <span>{{ error }}</span>
      </div>
      <button
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm text-white rounded border border-slate-600 transition-colors"
        @click="fetchData"
      >
        Retry
      </button>
    </div>

    <div
      v-else-if="rows.length === 0"
      class="flex items-center justify-center p-12 text-slate-500 bg-slate-800 rounded-xl border border-slate-700 min-h-[300px]"
    >
      No data found.
    </div>

    <!-- Table -->
    <div
      v-else
      class="w-full overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl shadow-sm"
    >
      <table class="w-full text-left border-collapse text-sm">
        <thead
          class="bg-slate-900/80 sticky top-0 z-10 border-b border-slate-700"
        >
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="
                col.width ? { width: col.width, minWidth: col.width } : {}
              "
              :class="[
                'px-4 py-3 font-semibold text-xs tracking-wider text-slate-400 uppercase whitespace-nowrap select-none',
                col.sortable !== false
                  ? 'cursor-pointer hover:text-blue-400 transition-colors'
                  : '',
              ]"
              @click="col.sortable !== false && toggleSort(col.key)"
            >
              <div class="flex items-center gap-1">
                {{ col.label }}
                <span
                  v-if="sortBy === col.key"
                  class="text-[10px] text-blue-500 w-3 text-center"
                >
                  {{ sortAsc ? "▲" : "▼" }}
                </span>
                <span
                  v-else-if="col.sortable !== false"
                  class="text-[10px] text-slate-600 w-3 text-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ↕
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-700/50">
          <tr
            v-for="(row, idx) in rows"
            :key="row.id || idx"
            @click="$emit('row-click', row)"
            class="hover:bg-slate-700/30 transition-colors group cursor-default"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              :class="['px-4 py-3 text-slate-300 max-w-xs truncate', col.class]"
              :title="String(formatCellValue(col.key, row[col.key]))"
            >
              <template v-if="col.render">
                <SafeHtml :content="String(col.render(row[col.key], row) || '')" />
              </template>
              <template v-else-if="col.type === 'date'">
                <span class="tabular-nums text-slate-400">{{
                  formatDate(row[col.key])
                }}</span>
              </template>
              <template v-else-if="col.type === 'number'">
                <span class="tabular-nums font-medium">{{
                  formatNumber(row[col.key])
                }}</span>
              </template>
              <template v-else-if="col.type === 'currency'">
                <span class="tabular-nums font-medium text-emerald-400"
                  >฿{{ formatNumber(row[col.key]) }}</span
                >
              </template>
              <template v-else-if="col.type === 'json'">
                <details class="group/json">
                  <summary
                    class="cursor-pointer text-blue-400 hover:text-blue-300 text-xs font-mono truncate max-w-[200px] list-none select-none flex items-center gap-1"
                  >
                    <svg
                      class="w-3 h-3 transition-transform group-open/json:rotate-90"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {{
                      typeof row[col.key] === "object"
                        ? "{...}"
                        : String(row[col.key] || "").substring(0, 30)
                    }}
                  </summary>
                  <pre
                    class="text-[10px] text-slate-400 max-h-48 overflow-auto bg-slate-900/80 p-2 rounded border border-slate-700 mt-2 font-mono scrollbar-thin scrollbar-thumb-slate-700 shadow-inner block"
                    >{{ JSON.stringify(row[col.key], null, 2) }}</pre
                  >
                </details>
              </template>
              <template v-else>
                {{ formatCellValue(col.key, row[col.key]) }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="totalPages > 0"
      class="flex flex-wrap items-center justify-between gap-4 px-1 pb-2"
    >
      <div class="text-xs text-slate-500">
        Showing
        <span class="font-medium text-slate-400 tabular-nums">{{
          Math.min((currentPage - 1) * currentPageSize + 1, total)
        }}</span>
        to
        <span class="font-medium text-slate-400 tabular-nums">{{
          Math.min(currentPage * currentPageSize, total)
        }}</span>
        of
        <span class="font-medium text-slate-400 tabular-nums">{{ total }}</span>
        results
      </div>

      <div class="flex items-center gap-1">
        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="currentPage <= 1"
          @click="goPage(1)"
          title="First Page"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m11 17-5-5 5-5" />
            <path d="m18 17-5-5 5-5" />
          </svg>
        </button>
        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="currentPage <= 1"
          @click="goPage(currentPage - 1)"
          title="Previous Page"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div
          class="px-3 py-1 mx-1 text-xs font-medium bg-slate-800 border border-slate-700 rounded-lg text-slate-300 tabular-nums"
        >
          {{ currentPage }} / {{ totalPages }}
        </div>

        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="currentPage >= totalPages"
          @click="goPage(currentPage + 1)"
          title="Next Page"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="currentPage >= totalPages"
          @click="goPage(totalPages)"
          title="Last Page"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m13 17 5-5-5-5" />
            <path d="m6 17 5-5-5-5" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { maskSensitiveField } from "../../utils/privacyMask";
import SafeHtml from "../ui/SafeHtml.vue";

const props = defineProps({
	columns: { type: Array, required: true },
	fetchFn: { type: Function, required: true },
	searchable: { type: Boolean, default: true },
	searchPlaceholder: { type: String, default: "Search..." },
	exportable: { type: Boolean, default: true },
	defaultSort: { type: String, default: "created_at" },
	defaultAsc: { type: Boolean, default: false },
	extraFilters: { type: Object, default: () => ({}) },
	dateRange: { type: Object, default: null },
	autoLoad: { type: Boolean, default: true },
});

defineEmits(["row-click"]);

const rows = ref([]);
const total = ref(0);
const totalPages = ref(0);
const currentPage = ref(1);
const currentPageSize = ref(25);
const sortBy = ref(props.defaultSort);
const sortAsc = ref(props.defaultAsc);
const searchQuery = ref("");
const loading = ref(false);
const error = ref(null);

let debounceTimer = null;
const debouncedFetch = () => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		currentPage.value = 1;
		fetchData();
	}, 300);
};

const fetchData = async () => {
	loading.value = true;
	error.value = null;
	try {
		const result = await props.fetchFn({
			page: currentPage.value,
			pageSize: currentPageSize.value,
			orderBy: sortBy.value,
			ascending: sortAsc.value,
			search: searchQuery.value,
			filters: props.extraFilters,
			dateRange: props.dateRange,
		});
		rows.value = result.rows || result.data || [];
		total.value = result.total || result.count || 0;
		totalPages.value =
			result.totalPages || Math.ceil(total.value / currentPageSize.value);
	} catch (e) {
		error.value = e.message || "Failed to fetch data";
		rows.value = [];
	} finally {
		loading.value = false;
	}
};

const toggleSort = (key) => {
	if (sortBy.value === key) {
		sortAsc.value = !sortAsc.value;
	} else {
		sortBy.value = key;
		sortAsc.value = true;
	}
	fetchData();
};

const goPage = (p) => {
	currentPage.value = Math.max(1, Math.min(p, totalPages.value));
	fetchData();
};

const formatDate = (val) => {
	if (!val) return "—";
	try {
		return new Date(val).toLocaleString("en-GB", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return val;
	}
};

const formatNumber = (val) => {
	const n = Number(val);
	return Number.isNaN(n) ? (val ?? "—") : n.toLocaleString("en-US");
};

const formatCellValue = (key, val) => {
	if (val === null || val === undefined || val === "") return "—";
	return maskSensitiveField(String(key || ""), val);
};

const exportCSV = () => {
	if (!rows.value.length) return;
	const headers = props.columns.map((c) => c.label);
	const csvRows = rows.value.map((row) =>
		props.columns
			.map((c) => {
				const val = row[c.key];
				if (val === null || val === undefined) return "";
				const str = typeof val === "object" ? JSON.stringify(val) : String(val);
				return `"${str.replace(/"/g, '""')}"`;
			})
			.join(","),
	);
	const csv = [headers.join(","), ...csvRows].join("\n");
	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `export-${Date.now()}.csv`;
	a.click();
	URL.revokeObjectURL(url);
};

watch(
	() => props.extraFilters,
	() => {
		currentPage.value = 1;
		fetchData();
	},
	{ deep: true },
);
watch(
	() => props.dateRange,
	() => {
		currentPage.value = 1;
		fetchData();
	},
	{ deep: true },
);

// Expose for parent
defineExpose({ fetchData, rows, total });

onMounted(() => {
	if (props.autoLoad) fetchData();
});
</script>
