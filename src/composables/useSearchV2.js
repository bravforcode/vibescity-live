import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * 🔍 VibeCity Core Engine V2 - Search Composable
 * Handles high-performance search using Postgres full-text search (tsvector).
 */
export function useSearchV2() {
	const results = ref([]);
	const isLoading = ref(false);
	const error = ref(null);

	/**
	 * Search Venues
	 * @param {string} query - Search text
	 * @param {number} limit - Max results (default 20)
	 */
	const searchVenues = async (
		query,
		limit = 20,
		offset = 0,
		lat = null,
		lng = null,
	) => {
		if (!query || query.trim().length === 0) {
			results.value = [];
			return;
		}

		isLoading.value = true;
		error.value = null;

		try {
			const { data, error: err } = await supabase.rpc("search_venues_v2", {
				p_query: query,
				p_lat: lat,
				p_lng: lng,
				p_limit: limit,
				p_offset: offset,
			});

			if (err) throw err;

			results.value = data || [];
		} catch (e) {
			console.error("❌ [useSearchV2] Search failed:", e);
			error.value = e;
			results.value = [];
		} finally {
			isLoading.value = false;
		}
	};

	const clearSearch = () => {
		results.value = [];
		error.value = null;
	};

	return {
		results,
		isLoading,
		error,
		searchVenues,
		clearSearch,
	};
}
