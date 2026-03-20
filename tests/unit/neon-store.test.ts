/**
 * Unit Tests for Neon Pinia Store
 *
 * Tests state management, actions, and getters for the neon store.
 * Validates: Requirements 8.6, 9.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNeonStore } from '@/stores/neon/useNeonStore';
import type { VenueCategory } from '@/stores/neon/useNeonStore';

// ============================================================================
// Helpers
// ============================================================================

function makeCategories(count: number): VenueCategory[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cat-${i + 1}`,
    name: `Category ${i + 1}`,
  }));
}

function makeSupabaseMock(categories: VenueCategory[], shouldFail = false) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) =>
        shouldFail
          ? Promise.resolve({ data: null, error: new Error('DB connection failed') })
          : Promise.resolve({ data: categories, error: null }),
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('useNeonStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty colorMap', () => {
      const store = useNeonStore();
      expect(store.colorMap.size).toBe(0);
    });

    it('should have empty categories', () => {
      const store = useNeonStore();
      expect(store.categories).toHaveLength(0);
    });

    it('should not be loading', () => {
      const store = useNeonStore();
      expect(store.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const store = useNeonStore();
      expect(store.hasError).toBe(false);
      expect(store.error).toBeNull();
    });
  });

  describe('generateColors', () => {
    it('should generate a color for each category', () => {
      const store = useNeonStore();
      const cats = makeCategories(5);
      store.categories = cats;
      store.generateColors();

      expect(store.colorMap.size).toBe(5);
      cats.forEach(cat => {
        expect(store.colorMap.has(cat.id)).toBe(true);
      });
    });

    it('should generate colors with valid HSL constraints', () => {
      const store = useNeonStore();
      const cats = makeCategories(10);
      store.generateColors(cats);

      store.colorMap.forEach(color => {
        expect(color.hsl.s).toBeGreaterThanOrEqual(70);
        expect(color.hsl.s).toBeLessThanOrEqual(100);
        expect(color.hsl.l).toBeGreaterThanOrEqual(50);
        expect(color.hsl.l).toBeLessThanOrEqual(70);
      });
    });

    it('should do nothing when category list is empty', () => {
      const store = useNeonStore();
      store.generateColors([]);
      expect(store.colorMap.size).toBe(0);
    });

    it('should accept an explicit category list', () => {
      const store = useNeonStore();
      const cats = makeCategories(3);
      store.generateColors(cats);

      expect(store.colorMap.size).toBe(3);
    });
  });

  describe('getCategoryColor', () => {
    it('should return the correct color for a known category', () => {
      const store = useNeonStore();
      const cats = makeCategories(5);
      store.generateColors(cats);

      const color = store.getCategoryColor('cat-1');
      expect(color).toBeDefined();
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    });

    it('should return a fallback color for unknown category', () => {
      const store = useNeonStore();
      const color = store.getCategoryColor('unknown-id');
      expect(color).toBeDefined();
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    });

    it('should return different colors for different categories', () => {
      const store = useNeonStore();
      const cats = makeCategories(5);
      store.generateColors(cats);

      const color1 = store.getCategoryColor('cat-1');
      const color2 = store.getCategoryColor('cat-2');
      expect(color1.hex).not.toBe(color2.hex);
    });
  });

  describe('fetchCategories', () => {
    it('should populate categories and colorMap on success', async () => {
      const store = useNeonStore();
      const cats = makeCategories(5);
      const client = makeSupabaseMock(cats);

      await store.fetchCategories(client as never);

      expect(store.categories).toHaveLength(5);
      expect(store.colorMap.size).toBe(5);
      expect(store.isLoading).toBe(false);
      expect(store.hasError).toBe(false);
    });

    it('should set loading to true during fetch', async () => {
      const store = useNeonStore();
      const cats = makeCategories(3);

      let loadingDuringFetch = false;
      const slowClient = {
        from: (_table: string) => ({
          select: async (_cols: string) => {
            loadingDuringFetch = store.isLoading;
            return { data: cats, error: null };
          },
        }),
      };

      await store.fetchCategories(slowClient as never);
      expect(loadingDuringFetch).toBe(true);
      expect(store.isLoading).toBe(false);
    });

    it('should set error state on database failure', async () => {
      const store = useNeonStore();
      const client = makeSupabaseMock([], true);

      await store.fetchCategories(client as never);

      expect(store.hasError).toBe(true);
      expect(store.error).toContain('DB connection failed');
      expect(store.isLoading).toBe(false);
    });

    it('should set error when no client provided', async () => {
      const store = useNeonStore();
      await store.fetchCategories(undefined);

      expect(store.hasError).toBe(true);
      expect(store.isLoading).toBe(false);
    });

    it('should apply fallback palette on error if categories exist', async () => {
      const store = useNeonStore();
      // Pre-populate categories
      store.categories = makeCategories(3);

      const client = makeSupabaseMock([], true);
      await store.fetchCategories(client as never);

      // Fallback palette should be applied
      expect(store.colorMap.size).toBe(3);
    });
  });

  describe('updateConfig', () => {
    it('should merge partial config updates', () => {
      const store = useNeonStore();
      store.updateConfig({ enabled: false });
      expect(store.config.enabled).toBe(false);
      // Other fields should remain unchanged
      expect(store.config.glow).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const store = useNeonStore();
      const cats = makeCategories(5);
      const client = makeSupabaseMock(cats);
      await store.fetchCategories(client as never);

      store.reset();

      expect(store.colorMap.size).toBe(0);
      expect(store.categories).toHaveLength(0);
      expect(store.isLoading).toBe(false);
      expect(store.hasError).toBe(false);
    });
  });

  describe('categoryCount getter', () => {
    it('should reflect current category count', () => {
      const store = useNeonStore();
      expect(store.categoryCount).toBe(0);

      store.categories = makeCategories(7);
      expect(store.categoryCount).toBe(7);
    });
  });
});
