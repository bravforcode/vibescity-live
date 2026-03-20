/**
 * Neon Venue Signs System - Color Cache
 *
 * Provides localStorage-based caching for category color mappings with:
 * - 24-hour TTL
 * - Checksum-based invalidation when the category list changes
 * - Version-based invalidation for schema upgrades
 *
 * Validates: Requirements 2.5, 9.5, 9.6
 */

import type { NeonColor } from "./neon-config";

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = "neon-venue-colors";
const CACHE_VERSION = "1.0.0";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Types
// ============================================================================

export interface ColorCacheEntry {
	categoryId: string;
	color: NeonColor;
}

export interface ColorCache {
	version: string;
	timestamp: number;
	expiresAt: number;
	checksum: string;
	entries: ColorCacheEntry[];
}

// ============================================================================
// Checksum
// ============================================================================

/**
 * Generates a simple checksum from an array of category IDs.
 * Used to detect when the category list has changed.
 *
 * @param categoryIds - Sorted array of category ID strings
 * @returns Checksum string
 */
export function generateChecksum(categoryIds: string[]): string {
	const sorted = [...categoryIds].sort();
	const joined = sorted.join("|");

	// djb2 hash — fast, deterministic, good distribution for short strings
	let hash = 5381;
	for (let i = 0; i < joined.length; i++) {
		hash = ((hash << 5) + hash) ^ joined.charCodeAt(i);
		hash = hash >>> 0; // keep as unsigned 32-bit
	}
	return hash.toString(16).padStart(8, "0");
}

// ============================================================================
// Save / Load
// ============================================================================

/**
 * Saves the category color map to localStorage with a 24-hour TTL.
 *
 * @param colorMap - Map of categoryId → NeonColor
 * @param categoryIds - List of category IDs (used for checksum)
 */
export function saveToCache(
	colorMap: Map<string, NeonColor>,
	categoryIds: string[],
): void {
	try {
		const now = Date.now();
		const entries: ColorCacheEntry[] = [];

		colorMap.forEach((color, categoryId) => {
			entries.push({ categoryId, color });
		});

		const cache: ColorCache = {
			version: CACHE_VERSION,
			timestamp: now,
			expiresAt: now + CACHE_TTL_MS,
			checksum: generateChecksum(categoryIds),
			entries,
		};

		localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch (err) {
		// localStorage may be unavailable (private browsing, quota exceeded)
		console.warn("[NeonCache] Failed to save cache:", err);
	}
}

/**
 * Loads the color cache from localStorage.
 *
 * Returns null if:
 * - No cache exists
 * - Cache has expired (> 24 hours)
 * - Cache version does not match
 * - Checksum does not match the provided category IDs
 *
 * @param categoryIds - Current list of category IDs for checksum validation
 * @returns Parsed ColorCache or null
 */
export function loadFromCache(categoryIds: string[]): ColorCache | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;

		const cache: ColorCache = JSON.parse(raw);

		// Version check
		if (cache.version !== CACHE_VERSION) {
			clearCache();
			return null;
		}

		// Expiration check
		if (Date.now() > cache.expiresAt) {
			clearCache();
			return null;
		}

		// Checksum check — invalidate if category list changed
		const currentChecksum = generateChecksum(categoryIds);
		if (cache.checksum !== currentChecksum) {
			clearCache();
			return null;
		}

		return cache;
	} catch (err) {
		console.warn("[NeonCache] Failed to load cache:", err);
		clearCache();
		return null;
	}
}

/**
 * Converts a ColorCache back into a Map<categoryId, NeonColor>.
 *
 * @param cache - Loaded ColorCache
 * @returns Reconstructed color map
 */
export function cacheToColorMap(cache: ColorCache): Map<string, NeonColor> {
	const map = new Map<string, NeonColor>();
	cache.entries.forEach(({ categoryId, color }) => {
		map.set(categoryId, color);
	});
	return map;
}

/**
 * Removes the color cache from localStorage.
 */
export function clearCache(): void {
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {
		// Ignore errors during cleanup
	}
}

/**
 * Returns true if a valid, non-expired cache exists for the given category IDs.
 *
 * @param categoryIds - Current list of category IDs
 */
export function isCacheValid(categoryIds: string[]): boolean {
	return loadFromCache(categoryIds) !== null;
}
