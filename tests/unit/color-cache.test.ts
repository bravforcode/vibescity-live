/**
 * Integration Tests for Color Cache
 *
 * Tests localStorage-based caching for category color mappings.
 * Validates: Requirements 2.5, 9.5, 9.6
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveToCache,
  loadFromCache,
  clearCache,
  cacheToColorMap,
  generateChecksum,
  isCacheValid,
} from '@/lib/neon/color-cache';
import { generateNeonColors } from '@/lib/neon/color-engine';
import type { NeonColor } from '@/lib/neon/neon-config';

// ============================================================================
// localStorage mock
// ============================================================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================================================
// Helpers
// ============================================================================

function makeColorMap(ids: string[]): Map<string, NeonColor> {
  const colors = generateNeonColors(ids.length);
  const map = new Map<string, NeonColor>();
  ids.forEach((id, i) => map.set(id, colors[i]));
  return map;
}

// ============================================================================
// Tests
// ============================================================================

describe('Color Cache', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateChecksum', () => {
    it('should produce the same checksum for the same IDs', () => {
      const ids = ['cat-1', 'cat-2', 'cat-3'];
      expect(generateChecksum(ids)).toBe(generateChecksum(ids));
    });

    it('should produce the same checksum regardless of input order', () => {
      const ids1 = ['cat-1', 'cat-2', 'cat-3'];
      const ids2 = ['cat-3', 'cat-1', 'cat-2'];
      expect(generateChecksum(ids1)).toBe(generateChecksum(ids2));
    });

    it('should produce different checksums for different ID sets', () => {
      const ids1 = ['cat-1', 'cat-2'];
      const ids2 = ['cat-1', 'cat-3'];
      expect(generateChecksum(ids1)).not.toBe(generateChecksum(ids2));
    });

    it('should handle empty array', () => {
      expect(generateChecksum([])).toBeDefined();
    });
  });

  describe('saveToCache and loadFromCache round trip', () => {
    it('should save and load color map correctly', () => {
      const ids = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);
      const cache = loadFromCache(ids);

      expect(cache).not.toBeNull();
      expect(cache!.entries).toHaveLength(3);
    });

    it('should restore all colors with correct hex values', () => {
      const ids = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);
      const cache = loadFromCache(ids);
      const restored = cacheToColorMap(cache!);

      ids.forEach(id => {
        expect(restored.has(id)).toBe(true);
        expect(restored.get(id)!.hex).toBe(colorMap.get(id)!.hex);
      });
    });

    it('should return null when no cache exists', () => {
      const result = loadFromCache(['cat-1']);
      expect(result).toBeNull();
    });
  });

  describe('cache expiration', () => {
    it('should return null after 24 hours', () => {
      vi.useFakeTimers();
      const ids = ['cat-1', 'cat-2'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);

      // Advance time by 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const result = loadFromCache(ids);
      expect(result).toBeNull();
    });

    it('should return cache before 24 hours', () => {
      vi.useFakeTimers();
      const ids = ['cat-1', 'cat-2'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);

      // Advance time by 23 hours
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);

      const result = loadFromCache(ids);
      expect(result).not.toBeNull();
    });
  });

  describe('cache invalidation on category change', () => {
    it('should invalidate cache when category IDs change', () => {
      const originalIds = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(originalIds);

      saveToCache(colorMap, originalIds);

      // Load with different category IDs
      const newIds = ['cat-1', 'cat-2', 'cat-4']; // cat-3 replaced by cat-4
      const result = loadFromCache(newIds);
      expect(result).toBeNull();
    });

    it('should invalidate cache when a category is added', () => {
      const originalIds = ['cat-1', 'cat-2'];
      const colorMap = makeColorMap(originalIds);

      saveToCache(colorMap, originalIds);

      const expandedIds = ['cat-1', 'cat-2', 'cat-3'];
      const result = loadFromCache(expandedIds);
      expect(result).toBeNull();
    });

    it('should invalidate cache when a category is removed', () => {
      const originalIds = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(originalIds);

      saveToCache(colorMap, originalIds);

      const reducedIds = ['cat-1', 'cat-2'];
      const result = loadFromCache(reducedIds);
      expect(result).toBeNull();
    });

    it('should remain valid when same IDs are provided in different order', () => {
      const ids = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);

      const shuffled = ['cat-3', 'cat-1', 'cat-2'];
      const result = loadFromCache(shuffled);
      expect(result).not.toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should remove cache from localStorage', () => {
      const ids = ['cat-1'];
      saveToCache(makeColorMap(ids), ids);

      clearCache();

      expect(loadFromCache(ids)).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('should return true for a fresh valid cache', () => {
      const ids = ['cat-1', 'cat-2'];
      saveToCache(makeColorMap(ids), ids);
      expect(isCacheValid(ids)).toBe(true);
    });

    it('should return false when no cache exists', () => {
      expect(isCacheValid(['cat-1'])).toBe(false);
    });

    it('should return false after expiration', () => {
      vi.useFakeTimers();
      const ids = ['cat-1'];
      saveToCache(makeColorMap(ids), ids);
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(isCacheValid(ids)).toBe(false);
    });
  });

  describe('cacheToColorMap', () => {
    it('should reconstruct map with all entries', () => {
      const ids = ['cat-1', 'cat-2', 'cat-3'];
      const colorMap = makeColorMap(ids);

      saveToCache(colorMap, ids);
      const cache = loadFromCache(ids)!;
      const restored = cacheToColorMap(cache);

      expect(restored.size).toBe(3);
      ids.forEach(id => expect(restored.has(id)).toBe(true));
    });
  });
});
