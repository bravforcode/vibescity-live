import { useInfiniteQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import { useLocationStore } from "../store/locationStore";

/**
 * 🚀 VibeCity Core Engine V2 - Feed Composable (Vue Query powered)
 * Uses useInfiniteQuery for automatic caching, deduplication, and background refetch.
 *
 * API contract is backward-compatible:
 *   { cards, isLoading, isRefreshing, error, hasMore, fetchFeed, resetFeed }
 */

const PAGE_SIZE = 20;

/**
 * Fetch a single page of feed data from the Supabase RPC.
 */
async function fetchFeedPage({ lat, lng, pageParam = 0 }) {
	const { data, error } = await supabase.rpc("get_feed_cards_v2", {
		p_lat: lat,
		p_lng: lng,
		p_limit: PAGE_SIZE,
		p_offset: pageParam,
	});

	if (error) throw error;
	return data || [];
}

export function useFeedV2() {
	const locationStore = useLocationStore();

	// Reactive filter state (kept local, not part of query key)
	const categoryFilter = ref(null);
	const promotedOnly = ref(false);

	const userCoords = computed(() => {
		return locationStore.userLocation
			? {
					lat: locationStore.userLocation[0],
					lng: locationStore.userLocation[1],
				}
			: { lat: null, lng: null };
	});

	const {
		data,
		error: queryError,
		isLoading: queryIsLoading,
		isFetchingNextPage,
		isRefetching,
		hasNextPage,
		fetchNextPage,
		refetch,
	} = useInfiniteQuery({
		queryKey: ["feed-v2", userCoords],
		queryFn: ({ pageParam = 0 }) =>
			fetchFeedPage({
				lat: userCoords.value.lat,
				lng: userCoords.value.lng,
				pageParam,
			}),
		getNextPageParam: (lastPage, allPages) => {
			// If last page returned fewer than PAGE_SIZE, no more pages
			if (lastPage.length < PAGE_SIZE) return undefined;
			// Next offset = total items fetched so far
			return allPages.reduce((total, page) => total + page.length, 0);
		},
		initialPageParam: 0,
		// Only fetch when we have coordinates
		enabled: computed(
			() => userCoords.value.lat !== null && userCoords.value.lng !== null,
		),
	});

	// Flatten pages into a single cards array with client-side filtering
	const cards = computed(() => {
		if (!data.value?.pages) return [];

		let allCards = data.value.pages.flat();

		// Apply client-side category filter
		if (
			Array.isArray(categoryFilter.value) &&
			categoryFilter.value.length > 0
		) {
			const categories = new Set(
				categoryFilter.value.map((c) => String(c || "").toLowerCase()),
			);
			allCards = allCards.filter((c) =>
				categories.has(String(c?.category || "").toLowerCase()),
			);
		}

		// Apply promoted-only filter
		if (promotedOnly.value) {
			allCards = allCards.filter((c) => Number(c?.view_count || 0) > 0);
		}

		// Dedup by ID
		const seen = new Set();
		return allCards.filter((c) => {
			if (seen.has(c.id)) return false;
			seen.add(c.id);
			return true;
		});
	});

	// Backward-compatible interface
	const isLoading = computed(
		() => queryIsLoading.value || isFetchingNextPage.value,
	);
	const isRefreshing = computed(() => isRefetching.value);
	const error = computed(() => queryError.value);
	const hasMore = computed(() => hasNextPage.value ?? true);

	/**
	 * Fetch feed data.
	 * @param {Object} options
	 * @param {boolean} options.refresh - Reset and refetch from page 1
	 * @param {string[]} options.categoryFilter - Array of categories
	 * @param {boolean} options.promotedOnly - Show only boosted venues
	 */
	const fetchFeed = async ({
		refresh = false,
		categoryFilter: catFilter = null,
		promotedOnly: promoOnly = false,
	} = {}) => {
		// Update local filter state
		categoryFilter.value = catFilter;
		promotedOnly.value = promoOnly;

		if (refresh) {
			await refetch();
		} else if (hasNextPage.value) {
			await fetchNextPage();
		}
	};

	/**
	 * Reset the feed state (triggers refetch on next call)
	 */
	const resetFeed = () => {
		categoryFilter.value = null;
		promotedOnly.value = false;
		refetch();
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
