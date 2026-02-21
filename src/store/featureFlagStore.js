import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";

const DEFAULT_FLAGS = Object.freeze({
	use_v2_feed: true,
	use_v2_search: true,
	enable_web_vitals: false,
	enable_partner_program: false,
	enable_cinema_mall_explorer: false,
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
		} catch {
			// Fail-open with defaults to protect app startup.
			flags.value = { ...DEFAULT_FLAGS };
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
