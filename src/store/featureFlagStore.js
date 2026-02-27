import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { isSupabaseSchemaCacheError, supabase } from "../lib/supabase";

const DEFAULT_FLAGS = Object.freeze({
	use_v2_feed: true,
	use_v2_search: true,
	enable_web_vitals: false,
	enable_partner_program: false,
	enable_cinema_mall_explorer: false,
	enable_header_layout_guard_v2: true,
	enable_search_overlay_guard_v2: true,
	enable_map_render_scheduler_v2: true,
	enable_map_effects_pipeline_v2: true,
	enable_feed_virtualization_v2: true,
	enable_perf_guardrails_v2: true,
});

export const useFeatureFlagStore = defineStore("feature-flags", () => {
	const flags = ref({ ...DEFAULT_FLAGS });
	const loadedAt = ref(null);
	const isLoading = ref(false);

	const isStale = computed(() => {
		if (!loadedAt.value) return true;
		return Date.now() - loadedAt.value > 5 * 60 * 1000;
	});

	const isEnabled = (key) => Boolean(flags.value?.[key]);

	const refreshFlags = async ({ force = false } = {}) => {
		if (isLoading.value) return;
		if (!force && !isStale.value) return;
		const isE2E =
			import.meta.env.VITE_E2E === "true" ||
			import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
			import.meta.env.MODE === "e2e";
		if (isE2E) {
			flags.value = { ...DEFAULT_FLAGS };
			loadedAt.value = Date.now();
			return;
		}

		isLoading.value = true;
		try {
			const { data, error } = await supabase
				.from("feature_flags_public")
				.select("key,enabled")
				.limit(200);
			if (error) throw error;

			const next = { ...DEFAULT_FLAGS };
			for (const row of data || []) {
				if (!row?.key) continue;
				next[row.key] = Boolean(row.enabled);
			}
			flags.value = next;
			loadedAt.value = Date.now();
		} catch (e) {
			// Fail-open with defaults to protect app startup.
			if (import.meta.env.DEV) {
				const label = isSupabaseSchemaCacheError(e)
					? "⚠️ feature_flags_public unavailable (schema cache retrying; using defaults):"
					: "⚠️ feature_flags_public fetch failed (using defaults):";
				console.warn(label, e?.message || e);
			}
			flags.value = { ...DEFAULT_FLAGS };
			loadedAt.value = Date.now();
		} finally {
			isLoading.value = false;
		}
	};

	return {
		flags,
		isLoading,
		isStale,
		isEnabled,
		refreshFlags,
	};
});
