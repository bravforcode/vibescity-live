/**
 * Unit Tests for Category Color Engine
 * 
 * Tests the core color generation algorithm including:
 * - HSL to RGB/Hex conversion
 * - Golden ratio hue distribution
 * - Red spectrum exclusion
 * - Saturation jitter
 * - ΔE perceptual color difference
 * - Color conflict resolution
 */

import { describe, it, expect } from 'vitest';
import {
  hslToRgb,
  rgbToHex,
  hslToNeonColor,
  calculateDeltaE,
  isInExcludedRange,
  generateGoldenRatioHue,
  adjustHueForExclusion,
  generateColorAtIndex,
  validateColor,
  checkColorConflict,
  resolveColorConflict,
  generateNeonColors,
  getDefaultNeutralColor,
} from '@/lib/neon/color-engine';
import type { HSLColor, NeonColor } from '@/lib/neon/neon-config';

describe('Color Conversion Utilities', () => {
  describe('hslToRgb', () => {
    it('should convert pure red HSL to RGB', () => {
      const hsl: HSLColor = { h: 0, s: 100, l: 50 };
      const rgb = hslToRgb(hsl);
      
      expect(rgb.r).toBe(255);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('should convert cyan HSL to RGB', () => {
      const hsl: HSLColor = { h: 180, s: 100, l: 50 };
      const rgb = hslToRgb(hsl);
      
      expect(rgb.r).toBe(0);
      expect(rgb.g).toBe(255);
      expect(rgb.b).toBe(255);
    });

    it('should convert gray (no saturation) HSL to RGB', () => {
      const hsl: HSLColor = { h: 0, s: 0, l: 50 };
      const rgb = hslToRgb(hsl);
      
      expect(rgb.r).toBe(128);
      expect(rgb.g).toBe(128);
      expect(rgb.b).toBe(128);
    });

    it('should handle lightness extremes', () => {
      const black: HSLColor = { h: 0, s: 100, l: 0 };
      const white: HSLColor = { h: 0, s: 100, l: 100 };
      
      const blackRgb = hslToRgb(black);
      const whiteRgb = hslToRgb(white);
      
      expect(blackRgb).toEqual({ r: 0, g: 0, b: 0 });
      expect(whiteRgb).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex format', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#FF0000');
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00FF00');
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe('#0000FF');
    });

    it('should pad single digit hex values', () => {
      expect(rgbToHex({ r: 15, g: 15, b: 15 })).toBe('#0F0F0F');
    });

    it('should handle edge cases', () => {
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#FFFFFF');
    });
  });

  describe('hslToNeonColor', () => {
    it('should create complete NeonColor object', () => {
      const hsl: HSLColor = { h: 180, s: 85, l: 60 };
      const neonColor = hslToNeonColor(hsl);
      
      expect(neonColor.hsl).toEqual(hsl);
      expect(neonColor.rgb).toBeDefined();
      expect(neonColor.hex).toMatch(/^#[0-9A-F]{6}$/);
    });
  });
});

describe('Perceptual Color Difference (ΔE)', () => {
  describe('calculateDeltaE', () => {
    it('should return 0 for identical colors', () => {
      const color: NeonColor = {
        hsl: { h: 180, s: 85, l: 60 },
        rgb: { r: 51, g: 224, b: 224 },
        hex: '#33E0E0',
      };
      
      const deltaE = calculateDeltaE(color, color);
      expect(deltaE).toBe(0);
    });

    it('should return high ΔE for very different colors', () => {
      const cyan: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const yellow: NeonColor = hslToNeonColor({ h: 60, s: 90, l: 60 });
      
      const deltaE = calculateDeltaE(cyan, yellow);
      expect(deltaE).toBeGreaterThan(30); // Should be well above threshold
    });

    it('should return low ΔE for similar colors', () => {
      const color1: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const color2: NeonColor = hslToNeonColor({ h: 185, s: 85, l: 60 });
      
      const deltaE = calculateDeltaE(color1, color2);
      expect(deltaE).toBeLessThan(30); // Should be below threshold
    });
  });
});

describe('Red Spectrum Exclusion', () => {
  describe('isInExcludedRange', () => {
    it('should return true for hues in [0, 20] range', () => {
      expect(isInExcludedRange(0)).toBe(true);
      expect(isInExcludedRange(10)).toBe(true);
      expect(isInExcludedRange(20)).toBe(true);
    });

    it('should return false for hues outside [0, 20] range', () => {
      expect(isInExcludedRange(21)).toBe(false);
      expect(isInExcludedRange(25)).toBe(false);
      expect(isInExcludedRange(180)).toBe(false);
      expect(isInExcludedRange(359)).toBe(false);
    });

    it('should handle negative hues by normalizing', () => {
      expect(isInExcludedRange(-10)).toBe(false); // Normalizes to 350
      expect(isInExcludedRange(-340)).toBe(true); // Normalizes to 20
    });

    it('should handle hues > 360 by normalizing', () => {
      expect(isInExcludedRange(370)).toBe(true); // Normalizes to 10
      expect(isInExcludedRange(380)).toBe(true); // Normalizes to 20
      expect(isInExcludedRange(390)).toBe(false); // Normalizes to 30
    });
  });

  describe('adjustHueForExclusion', () => {
    it('should shift excluded hues to 25°', () => {
      expect(adjustHueForExclusion(0)).toBe(25);
      expect(adjustHueForExclusion(10)).toBe(25);
      expect(adjustHueForExclusion(20)).toBe(25);
    });

    it('should not modify non-excluded hues', () => {
      expect(adjustHueForExclusion(25)).toBe(25);
      expect(adjustHueForExclusion(180)).toBe(180);
      expect(adjustHueForExclusion(270)).toBe(270);
    });
  });
});

describe('Golden Ratio Hue Distribution', () => {
  describe('generateGoldenRatioHue', () => {
    it('should start at 180° (cyan) by default', () => {
      const hue0 = generateGoldenRatioHue(0);
      expect(hue0).toBe(180);
    });

    it('should increment by golden angle (137.5°)', () => {
      const hue0 = generateGoldenRatioHue(0);
      const hue1 = generateGoldenRatioHue(1);
      
      const diff = (hue1 - hue0 + 360) % 360;
      expect(diff).toBeCloseTo(137.5, 1);
    });

    it('should wrap around 360°', () => {
      const hue2 = generateGoldenRatioHue(2);
      expect(hue2).toBeGreaterThanOrEqual(0);
      expect(hue2).toBeLessThan(360);
    });

    it('should generate evenly distributed hues', () => {
      const hues = Array.from({ length: 10 }, (_, i) => generateGoldenRatioHue(i));
      
      // All hues should be unique
      const uniqueHues = new Set(hues);
      expect(uniqueHues.size).toBe(10);
      
      // Hues should span the spectrum
      const minHue = Math.min(...hues);
      const maxHue = Math.max(...hues);
      expect(maxHue - minHue).toBeGreaterThan(100);
    });
  });
});

describe('Color Generation', () => {
  describe('generateColorAtIndex', () => {
    it('should generate color with saturation in [70, 100] range', () => {
      const color = generateColorAtIndex(0);
      
      expect(color.hsl.s).toBeGreaterThanOrEqual(70);
      expect(color.hsl.s).toBeLessThanOrEqual(100);
    });

    it('should generate color with lightness in [50, 70] range', () => {
      const color = generateColorAtIndex(0);
      
      expect(color.hsl.l).toBeGreaterThanOrEqual(50);
      expect(color.hsl.l).toBeLessThanOrEqual(70);
    });

    it('should not generate colors in red spectrum [0, 20]', () => {
      // Generate multiple colors to test exclusion
      const colors = Array.from({ length: 20 }, (_, i) => generateColorAtIndex(i));
      
      colors.forEach(color => {
        expect(isInExcludedRange(color.hsl.h)).toBe(false);
      });
    });

    it('should apply saturation jitter for variety', () => {
      // Generate multiple colors at same index (different random jitter)
      const saturations = Array.from({ length: 10 }, () => 
        generateColorAtIndex(0).hsl.s
      );
      
      // Should have some variation (not all identical)
      const uniqueSaturations = new Set(saturations);
      expect(uniqueSaturations.size).toBeGreaterThan(1);
    });

    it('should respect custom configuration', () => {
      const config = {
        saturationRange: [80, 90] as [number, number],
        lightnessRange: [55, 65] as [number, number],
      };
      
      const color = generateColorAtIndex(0, config);
      
      expect(color.hsl.s).toBeGreaterThanOrEqual(80);
      expect(color.hsl.s).toBeLessThanOrEqual(90);
      expect(color.hsl.l).toBeGreaterThanOrEqual(55);
      expect(color.hsl.l).toBeLessThanOrEqual(65);
    });
  });

  describe('validateColor', () => {
    it('should validate correct colors', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const config = {
        saturationRange: [70, 100] as [number, number],
        lightnessRange: [50, 70] as [number, number],
      };
      
      const result = validateColor(color, config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject colors with invalid saturation', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 50, l: 60 });
      const config = {
        saturationRange: [70, 100] as [number, number],
        lightnessRange: [50, 70] as [number, number],
      };
      
      const result = validateColor(color, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Saturation'))).toBe(true);
    });

    it('should reject colors with invalid lightness', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 40 });
      const config = {
        saturationRange: [70, 100] as [number, number],
        lightnessRange: [50, 70] as [number, number],
      };
      
      const result = validateColor(color, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Lightness'))).toBe(true);
    });

    it('should reject colors in excluded red spectrum', () => {
      const color: NeonColor = hslToNeonColor({ h: 10, s: 85, l: 60 });
      const config = {
        saturationRange: [70, 100] as [number, number],
        lightnessRange: [50, 70] as [number, number],
      };
      
      const result = validateColor(color, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('red spectrum'))).toBe(true);
    });
  });
});

describe('Color Conflict Detection and Resolution', () => {
  describe('checkColorConflict', () => {
    it('should detect no conflict for well-separated colors', () => {
      const color1: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const color2: NeonColor = hslToNeonColor({ h: 60, s: 90, l: 60 });
      
      const result = checkColorConflict(color1, [color2], 30);
      expect(result.hasConflict).toBe(false);
    });

    it('should detect conflict for similar colors', () => {
      const color1: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const color2: NeonColor = hslToNeonColor({ h: 185, s: 85, l: 60 });
      
      const result = checkColorConflict(color1, [color2], 30);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingColor).toBeDefined();
      expect(result.deltaE).toBeLessThan(30);
    });

    it('should check against multiple existing colors', () => {
      const newColor: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const existing = [
        hslToNeonColor({ h: 60, s: 90, l: 60 }),
        hslToNeonColor({ h: 120, s: 85, l: 60 }),
        hslToNeonColor({ h: 185, s: 85, l: 60 }), // This one conflicts
      ];
      
      const result = checkColorConflict(newColor, existing, 30);
      expect(result.hasConflict).toBe(true);
    });
  });

  describe('resolveColorConflict', () => {
    it('should return original color if no conflict', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const existing: NeonColor[] = [
        hslToNeonColor({ h: 60, s: 90, l: 60 }),
      ];
      
      const resolved = resolveColorConflict(color, existing, 30);
      expect(resolved.hsl.h).toBe(color.hsl.h);
    });

    it('should adjust hue to resolve conflict', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const existing: NeonColor[] = [
        hslToNeonColor({ h: 185, s: 85, l: 60 }), // Conflicts
      ];
      
      const resolved = resolveColorConflict(color, existing, 30);
      
      // Should have different hue
      expect(resolved.hsl.h).not.toBe(color.hsl.h);
      
      // Should not conflict anymore
      const deltaE = calculateDeltaE(resolved, existing[0]);
      expect(deltaE).toBeGreaterThanOrEqual(30);
    });

    it('should preserve saturation and lightness within valid range', () => {
      const color: NeonColor = hslToNeonColor({ h: 180, s: 85, l: 60 });
      const existing: NeonColor[] = [
        hslToNeonColor({ h: 185, s: 85, l: 60 }),
      ];
      
      const resolved = resolveColorConflict(color, existing, 30);
      
      // The new algorithm scans hue × saturation × lightness space using the
      // midpoint saturation of the allowed range [70, 100] = 85, and lightness
      // within [50, 70]. We verify the resolved color stays within valid ranges.
      expect(resolved.hsl.s).toBeGreaterThanOrEqual(70);
      expect(resolved.hsl.s).toBeLessThanOrEqual(100);
      expect(resolved.hsl.l).toBeGreaterThanOrEqual(50);
      expect(resolved.hsl.l).toBeLessThanOrEqual(70);
    });
  });
});

describe('Batch Color Generation', () => {
  describe('generateNeonColors', () => {
    it('should generate requested number of colors', () => {
      const colors = generateNeonColors(10);
      expect(colors).toHaveLength(10);
    });

    it('should generate unique colors', () => {
      const colors = generateNeonColors(10);
      const hexValues = colors.map(c => c.hex);
      const uniqueHexes = new Set(hexValues);
      
      expect(uniqueHexes.size).toBe(10);
    });

    it('should ensure all colors meet ΔE threshold', () => {
      const colors = generateNeonColors(10, {
        saturationRange: [70, 100],
        lightnessRange: [50, 70],
        minDeltaE: 30,
      });
      
      // Check all pairs
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const deltaE = calculateDeltaE(colors[i], colors[j]);
          expect(deltaE).toBeGreaterThanOrEqual(30);
        }
      }
    });

    it('should respect configuration constraints', () => {
      const config = {
        saturationRange: [80, 90] as [number, number],
        lightnessRange: [55, 65] as [number, number],
        minDeltaE: 25,
      };
      
      const colors = generateNeonColors(5, config);
      
      colors.forEach(color => {
        expect(color.hsl.s).toBeGreaterThanOrEqual(80);
        expect(color.hsl.s).toBeLessThanOrEqual(90);
        expect(color.hsl.l).toBeGreaterThanOrEqual(55);
        expect(color.hsl.l).toBeLessThanOrEqual(65);
      });
    });

    it('should not generate colors in red spectrum', () => {
      const colors = generateNeonColors(20);
      
      colors.forEach(color => {
        expect(isInExcludedRange(color.hsl.h)).toBe(false);
      });
    });

    it('should handle large batch generation', () => {
      const colors = generateNeonColors(50);
      
      expect(colors).toHaveLength(50);
      
      // Most should be unique (some duplicates acceptable after conflict resolution)
      const hexValues = colors.map(c => c.hex);
      const uniqueHexes = new Set(hexValues);
      expect(uniqueHexes.size).toBeGreaterThanOrEqual(45); // At least 90% unique
    });
  });
});

describe('Default Neutral Color', () => {
  describe('getDefaultNeutralColor', () => {
    it('should return warm gray color', () => {
      const color = getDefaultNeutralColor();
      
      expect(color.hsl.h).toBe(0);
      expect(color.hsl.s).toBe(0);
      expect(color.hsl.l).toBe(80);
    });

    it('should return consistent color', () => {
      const color1 = getDefaultNeutralColor();
      const color2 = getDefaultNeutralColor();
      
      expect(color1.hex).toBe(color2.hex);
    });
  });
});
