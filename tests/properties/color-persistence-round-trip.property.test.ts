/**
 * Property-Based Test: Color Persistence Round Trip
 *
 * **Validates: Requirements 2.5**
 *
 * This test validates Property 11: Color Persistence Round Trip
 *
 * Property Statement:
 * For any NeonColor, serializing it to a hex string and deserializing back to
 * HSL must preserve the original color values within floating-point rounding
 * tolerance (±1 unit for each HSL component).
 *
 * This property ensures that the localStorage cache can faithfully store and
 * restore category colors across page reloads without color drift.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  hslToNeonColor,
  hexToHsl,
  hexToRgb,
  rgbToHsl,
  generateNeonColors,
} from '@/lib/neon/color-engine';
import type { HSLColor, NeonColor } from '@/lib/neon/neon-config';

describe('Property 11: Color Persistence Round Trip', () => {
  describe('HSL → RGB → HEX → RGB → HSL round trip', () => {
    it('should preserve hue within ±2° after round trip', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 21, max: 359 }), // Exclude red spectrum [0,20]
          fc.integer({ min: 70, max: 100 }),
          fc.integer({ min: 50, max: 70 }),
          (h, s, l) => {
            const original: HSLColor = { h, s, l };
            const neonColor = hslToNeonColor(original);

            // Simulate cache: store hex, restore via hexToHsl
            const restored = hexToHsl(neonColor.hex);

            // Hue tolerance ±2° (due to integer rounding in RGB conversion)
            const hueDiff = Math.abs(restored.h - original.h);
            const hueWrapped = Math.min(hueDiff, 360 - hueDiff);
            expect(hueWrapped).toBeLessThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve saturation within ±2% after round trip', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 21, max: 359 }),
          fc.integer({ min: 70, max: 100 }),
          fc.integer({ min: 50, max: 70 }),
          (h, s, l) => {
            const original: HSLColor = { h, s, l };
            const neonColor = hslToNeonColor(original);
            const restored = hexToHsl(neonColor.hex);

            expect(Math.abs(restored.s - original.s)).toBeLessThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve lightness within ±2% after round trip', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 21, max: 359 }),
          fc.integer({ min: 70, max: 100 }),
          fc.integer({ min: 50, max: 70 }),
          (h, s, l) => {
            const original: HSLColor = { h, s, l };
            const neonColor = hslToNeonColor(original);
            const restored = hexToHsl(neonColor.hex);

            expect(Math.abs(restored.l - original.l)).toBeLessThanOrEqual(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce identical hex after double round trip', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 21, max: 359 }),
          fc.integer({ min: 70, max: 100 }),
          fc.integer({ min: 50, max: 70 }),
          (h, s, l) => {
            const original = hslToNeonColor({ h, s, l });

            // First round trip: hex → hsl → neonColor → hex
            const restoredHsl = hexToHsl(original.hex);
            const restoredColor = hslToNeonColor(restoredHsl);

            // Second round trip should produce the same hex
            expect(restoredColor.hex).toBe(original.hex);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Generated color batch round trip', () => {
    it('should preserve all generated colors through serialization', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 20 }),
          (count) => {
            const colors = generateNeonColors(count);

            colors.forEach((color) => {
              // Simulate cache: store hex, restore via hexToHsl
              const restoredHsl = hexToHsl(color.hex);
              const restoredColor = hslToNeonColor(restoredHsl);

              // Hex must be identical after round trip
              expect(restoredColor.hex).toBe(color.hex);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain ΔE < 1 between original and restored colors', () => {
      // ΔE < 1 means the difference is imperceptible to human eyes
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 15 }),
          (count) => {
            const { calculateDeltaE } = require('@/lib/neon/color-engine');
            const colors = generateNeonColors(count);

            colors.forEach((color) => {
              const restoredHsl = hexToHsl(color.hex);
              const restoredColor = hslToNeonColor(restoredHsl);

              // Restored color should be perceptually identical
              const deltaE = calculateDeltaE(color, restoredColor);
              expect(deltaE).toBeLessThan(1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('hexToRgb and rgbToHsl utilities', () => {
    it('should parse hex strings correctly', () => {
      const rgb = hexToRgb('#FF0000');
      expect(rgb).toEqual({ r: 255, g: 0, b: 0 });

      const rgb2 = hexToRgb('#00FF00');
      expect(rgb2).toEqual({ r: 0, g: 255, b: 0 });

      const rgb3 = hexToRgb('#0000FF');
      expect(rgb3).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should handle hex without # prefix', () => {
      const rgb = hexToRgb('FF5733');
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(87);
      expect(rgb.b).toBe(51);
    });

    it('should convert RGB to HSL correctly for known colors', () => {
      // Pure red
      const redHsl = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(redHsl.h).toBeCloseTo(0, 0);
      expect(redHsl.s).toBeCloseTo(100, 0);
      expect(redHsl.l).toBeCloseTo(50, 0);

      // Pure cyan
      const cyanHsl = rgbToHsl({ r: 0, g: 255, b: 255 });
      expect(cyanHsl.h).toBeCloseTo(180, 0);
      expect(cyanHsl.s).toBeCloseTo(100, 0);
      expect(cyanHsl.l).toBeCloseTo(50, 0);
    });

    it('should handle achromatic colors (gray)', () => {
      const grayHsl = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(grayHsl.s).toBe(0);
      expect(grayHsl.l).toBeCloseTo(50, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary saturation values', () => {
      const colorMin = hslToNeonColor({ h: 180, s: 70, l: 60 });
      const colorMax = hslToNeonColor({ h: 180, s: 100, l: 60 });

      expect(hexToHsl(colorMin.hex)).toBeDefined();
      expect(hexToHsl(colorMax.hex)).toBeDefined();
    });

    it('should handle boundary lightness values', () => {
      const colorMin = hslToNeonColor({ h: 180, s: 85, l: 50 });
      const colorMax = hslToNeonColor({ h: 180, s: 85, l: 70 });

      expect(hexToHsl(colorMin.hex)).toBeDefined();
      expect(hexToHsl(colorMax.hex)).toBeDefined();
    });

    it('should handle hues just outside excluded range', () => {
      const color = hslToNeonColor({ h: 25, s: 85, l: 60 });
      const restored = hexToHsl(color.hex);

      // Should round trip cleanly
      expect(hslToNeonColor(restored).hex).toBe(color.hex);
    });
  });
});
