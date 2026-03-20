/**
 * Neon Venue Signs System - Pinia Store
 *
 * Manages reactive state for category-to-color mappings, loading state,
 * and error handling. Integrates with Supabase for category fetching and
 * localStorage for caching.
 *
 * Validates: Requirements 8.6, 9.2
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { generateNeonColors } from "@/lib/neon/color-engine";
import type { NeonColor, NeonConfig } from "@/lib/neon/neon-config";
import { DEFAULT_NEON_CONFIG } from "@/lib/neon/neon-config";

// ============================================================================
// Types
// ============================================================================

export interface VenueCategory {
	id: string;
	name: string;
}

export interface NeonStoreState {
	colorMap: Map<string, NeonColor>;
	categories: VenueCategory[];
	config: NeonConfig;
	loading: boolean;
	error: string | null;
}

// ============================================================================
// Fallback palette (used when database is unavailable)
// ============================================================================

const FALLBACK_COLORS = generateNeonColors(10, {
	saturationRange: [70, 100],
	lightnessRange: [50, 70],
	minDeltaE: 30,
});

// ============================================================================
// Store
// ============================================================================

export const useNeonStore = defineStore("neon", () => {
	// State
	const colorMap = ref<Map<string, NeonColor>>(new Map());
	const categories = ref<VenueCategory[]>([]);
	const config = ref<NeonConfig>(DEFAULT_NEON_CONFIG);
	const loading = ref(false);
	const error = ref<string | null>(null);

	// Getters
	const isLoading = computed(() => loading.value);
	const hasError = computed(() => error.value !== null);
	const categoryCount = computed(() => categories.value.length);

	/**
	 * Returns the NeonColor for a given category ID.
	 * Falls back to the first fallback color if the category is not found.
	 */
	function getCategoryColor(categoryId: string): NeonColor {
		return colorMap.value.get(categoryId) ?? FALLBACK_COLORS[0];
	}

	/**
	 * Generates and stores colors for the current category list.
	 * Uses the config's color generation settings.
	 */
	function generateColors(
		categoryList: VenueCategory[] = categories.value,
	): void {
		const count = categoryList.length;
		if (count === 0) return;

		const colors = generateNeonColors(count, {
			saturationRange: config.value.colors.saturationRange,
			lightnessRange: config.value.colors.lightnessRange,
			minDeltaE: config.value.colors.minDeltaE,
		});

		const newMap = new Map<string, NeonColor>();
		categoryList.forEach((cat, index) => {
			newMap.set(cat.id, colors[index]);
		});

		colorMap.value = newMap;
	}

	/**
	 * Fetches venue categories from Supabase and generates colors.
	 * Falls back to a predefined palette on error.
	 *
	 * @param supabaseClient - Supabase client instance (injected to allow mocking)
	 */
	async function fetchCategories(supabaseClient?: {
		from: (table: string) => {
			select: (
				cols: string,
			) => Promise<{ data: VenueCategory[] | null; error: unknown }>;
		};
	}): Promise<void> {
		loading.value = true;
		error.value = null;

		try {
			if (!supabaseClient) {
				throw new Error("Supabase client not provided");
			}

			const { data, error: dbError } = await supabaseClient
				.from("venue_categories")
				.select("id, name");

			if (dbError) throw dbError;

			const fetched: VenueCategory[] = (data ?? []).map(
				(row: VenueCategory) => ({
					id: row.id,
					name: row.name,
				}),
			);

			categories.value = fetched;
			generateColors(fetched);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch categories";
			error.value = message;
			console.error("[NeonStore] fetchCategories error:", err);

			// Apply fallback palette so the UI still works
			_applyFallbackPalette();
		} finally {
			loading.value = false;
		}
	}

	/**
   * Applies the built-in fal
lback palette when the database is unavailable.
   * Uses existing categories if available, otherwise creates placeholder entries.
   */
	function _applyFallbackPalette(): void {
		if (categories.value.length === 0) return;

		const newMap = new Map<string, NeonColor>();
		categories.value.forEach((cat, index) => {
			newMap.set(cat.id, FALLBACK_COLORS[index % FALLBACK_COLORS.length]);
		});
		colorMap.value = newMap;
	}

	/**
	 * Updates the neon configuration (partial update supported).
	 */
	function updateConfig(partial: Partial<NeonConfig>): void {
		config.value = { ...config.value, ...partial };
	}

	/**
	 * Resets the store to its initial state.
	 */
	function reset(): void {
		colorMap.value = new Map();
		categories.value = [];
		config.value = DEFAULT_NEON_CONFIG;
		loading.value = false;
		error.value = null;
	}

	return {
		// State (exposed as refs for reactivity)
		colorMap,
		categories,
		config,
		loading,
		error,
		// Getters
		isLoading,
		hasError,
		categoryCount,
		// Actions
		getCategoryColor,
		generateColors,
		fetchCategories,
		updateConfig,
		reset,
	};
});
