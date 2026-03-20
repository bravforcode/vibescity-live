# Neon Venue Signs System - Core Library

This directory contains the core configuration and constants for the Neon Venue Signs System.

## Files

### `neon-config.ts`
Defines TypeScript interfaces and Zod validation schemas for the neon system configuration:
- **Interfaces**: `NeonConfig`, `GlowConfig`, `ColorGenerationConfig`, `LabelConfig`, `PerformanceConfig`
- **Color Types**: `HSLColor`, `RGBColor`, `NeonColor`, `CategoryColorMapping`
- **Validation**: Zod schemas for runtime validation
- **Defaults**: `DEFAULT_NEON_CONFIG` with optimized values

### `neon-constants.ts`
Defines constant values used throughout the neon system:
- **Glow Intensity**: `GlowIntensity` enum for interaction states
- **Colors**: Default colors, fallback palette, golden angle for distribution
- **Timing**: Transition durations, animation delays, cache expiration
- **CSS**: Easing functions, blur/spread ranges, shadow layers
- **Performance**: Max labels, zoom levels, FPS targets
- **Storage**: localStorage keys and cache version
- **Accessibility**: WCAG compliance constants
- **Error Messages**: Standard error messages
- **Feature Flags**: Feature flag keys

## Usage

```typescript
import { DEFAULT_NEON_CONFIG, validateNeonConfig } from '@/lib/neon/neon-config';
import { GlowIntensity, FALLBACK_COLOR_PALETTE } from '@/lib/neon/neon-constants';

// Use default configuration
const config = DEFAULT_NEON_CONFIG;

// Validate custom configuration
const customConfig = validateNeonConfig({
  enabled: true,
  glow: { baseBlur: 15, /* ... */ },
  // ...
});

// Use intensity levels
const hoverIntensity = GlowIntensity.HOVER; // 1.3

// Use fallback colors
const fallbackColor = FALLBACK_COLOR_PALETTE[0]; // Cyan
```

## Requirements Validated

This module validates the following requirements:
- **8.1**: Vue 3 composables with TypeScript type definitions
- **8.5**: TypeScript interfaces for all data structures
- **13.1**: Configuration object with adjustable parameters
- **13.6**: Zod schema for configuration validation

## Next Steps

1. Implement Category Color Engine (`src/lib/neon/color-engine.ts`)
2. Implement Glow Effect Engine (`src/lib/neon/glow-engine.ts`)
3. Create Pinia store (`src/stores/neon/neonStore.ts`)
4. Create Vue composables (`src/composables/neon/`)
5. Create CSS styles (`src/styles/neon/neon-effects.css`)
