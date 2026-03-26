import { onUnmounted, ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * 🔍 VibeCity Core Engine V2 - Search Composable
 * Handles high-performance search using Postgres full-text search (tsvector).
 */
export function useSearchV2() {
	const results = ref([]);
	const isLoading = ref(false);
	const error = ref(null);
	let activeRequestId = 0;
	let abortController = null;

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
			activeRequestId += 1;
			abortController?.abort?.();
			abortController = null;
			results.value = [];
			isLoading.value = false;
			return;
		}

		const requestId = ++activeRequestId;
		abortController?.abort?.();
		abortController = new AbortController();
		isLoading.value = true;
		error.value = null;

		try {
			let request = supabase.rpc("search_venues_v2", {
				p_query: query,
				p_lat: lat,
				p_lng: lng,
				p_limit: limit,
				p_offset: offset,
			});
			if (typeof request?.abortSignal === "function") {
				request = request.abortSignal(abortController.signal);
			}

			const { data, error: err } = await request;

			if (err) throw err;
			if (requestId !== activeRequestId) return;

			const seen = new Set();
			results.value = (data || []).filter((item) => {
				const key = `${String(item?.id ?? "").trim()}|${String(item?.name ?? "")
					.trim()
					.toLowerCase()}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		} catch (e) {
			if (e?.name === "AbortError") return;
			if (requestId !== activeRequestId) return;
			console.error("❌ [useSearchV2] Search failed:", e);
			error.value = e;
			results.value = [];
		} finally {
			if (requestId === activeRequestId) {
				isLoading.value = false;
			}
		}
	};

	const clearSearch = () => {
		activeRequestId += 1;
		abortController?.abort?.();
		abortController = null;
		results.value = [];
		error.value = null;
		isLoading.value = false;
	};

	onUnmounted(() => {
		abortController?.abort?.();
		abortController = null;
	});

	return {
		results,
		isLoading,
		error,
		searchVenues,
		clearSearch,
	};
}
