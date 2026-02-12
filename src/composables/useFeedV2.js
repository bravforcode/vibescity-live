import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useLocationStore } from "../store/locationStore";

/**
 * 🚀 VibeCity Core Engine V2 - Feed Composable
 * Handles high-performance feed generation using server-side pagination and sorting.
 */
export function useFeedV2() {
	const locationStore = useLocationStore();

	// State
	const cards = ref([]);
	const page = ref(1);
	const pageSize = 20;
	const isLoading = ref(false);
	const error = ref(null);
	const hasMore = ref(true);
	const isRefreshing = ref(false);

	// Computed
	const userCoords = computed(() => {
		return locationStore.userLocation
			? {
					lat: locationStore.userLocation[0],
					lng: locationStore.userLocation[1],
				}
			: { lat: null, lng: null };
	});

	/**
	 * Fetch Feed Data
	 * @param {Object} options
	 * @param {boolean} options.refresh - Reset list and fetch page 1
	 * @param {string[]} options.categoryFilter - Array of categories
	 * @param {boolean} options.promotedOnly - Show only boosted venues
	 */
	const fetchFeed = async ({
		refresh = false,
		categoryFilter = null,
		promotedOnly = false,
	} = {}) => {
		if (isLoading.value && !refresh) return;

		if (refresh) {
			isRefreshing.value = true;
			page.value = 1;
			hasMore.value = true;
			error.value = null;
		} else if (!hasMore.value) {
			return;
		}

		isLoading.value = true;

		try {
			const { data, error: err } = await supabase.rpc("get_feed_cards_v2", {
				p_lat: userCoords.value.lat,
				p_lng: userCoords.value.lng,
				p_limit: pageSize,
				p_offset: (page.value - 1) * pageSize,
			});

			if (err) throw err;

			// Transform or normalize if necessary (Supabase returns JSON, should be ready)
			let newCards = data || [];
			if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
				const categories = new Set(
					categoryFilter.map((c) => String(c || "").toLowerCase()),
				);
				newCards = newCards.filter((c) =>
					categories.has(String(c?.category || "").toLowerCase()),
				);
			}
			if (promotedOnly) {
				newCards = newCards.filter((c) => Number(c?.view_count || 0) > 0);
			}

			if (refresh) {
				cards.value = newCards;
			} else {
				// Simple append, relying on RPC for order consistency.
				// In highly dynamic lists, we might want to dedup, but RPC handles offset.
				// Dedup by ID just in case of shift:
				const existingIds = new Set(cards.value.map((c) => c.id));
				const uniqueNew = newCards.filter((c) => !existingIds.has(c.id));
				cards.value = [...cards.value, ...uniqueNew];
			}

			if (newCards.length < pageSize) {
				hasMore.value = false;
			} else {
				page.value++;
			}
		} catch (e) {
			console.error("❌ [useFeedV2] Failed to fetch feed:", e);
			error.value = e;
		} finally {
			isLoading.value = false;
			isRefreshing.value = false;
		}
	};

	/**
	 * Reset the feed state
	 */
	const resetFeed = () => {
		cards.value = [];
		page.value = 1;
		hasMore.value = true;
		error.value = null;
	};

	return {
		cards,
		isLoading,
		isRefreshing,
		error,
		hasMore,
		fetchFeed,
		resetFeed,
	};
}
