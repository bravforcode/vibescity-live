# Implementation Plan: Neon Venue Signs System

## Overview

This implementation plan transforms the Neon Venue Signs System design into actionable coding tasks. The system provides cyberpunk-inspired neon glow effects for venue labels and modals using Vue 3, TypeScript, Tailwind CSS, and Pinia. Implementation follows a phased approach prioritizing core infrastructure, rendering, components, accessibility, integration, and comprehensive testing.

**Tech Stack**: Vue 3 + TypeScript + Tailwind CSS + Pinia + Supabase + fast-check (property testing)

**Key Deliverables**:
- Category Color Engine with HSL generation algorithm
- Multi-layer GPU-accelerated glow effects
- MapLabel, NeonModal, and NeonCard components
- 53 correctness properties validated via property-based tests
- WCAG 2.1 AA accessibility compliance
- 30+ FPS performance with 50+ simultaneous labels

---

## Tasks

### Phase 1: Core Infrastructure

- [x] 1. Set up project structure and configuration
  - Create directory structure: `src/lib/neon/`, `src/composables/neon/`, `src/stores/neon/`, `src/styles/neon/`
  - Create `neon-config.ts` with TypeScript interfaces for NeonConfig
  - Set up Zod schema for configuration validation
  - Create constants file for default values (colors, blur radius, transition timing)
  - _Requirements: 8.1, 8.5, 13.1, 13.6_

- [-] 2. Implement Category Color Engine
  - [x] 2.1 Create core color generation algorithm
    - Implement HSL color generation with golden ratio distribution (137.5° hue spacing)
    - Add saturation range [70, 100] and lightness range [50, 70] constraints
    - Implement red spectrum exclusion [0, 20] degrees
    - Add saturation jitter (±5%) for visual variety
    - _Requirements: 2.1, 2.3, 2.4, 11.1, 11.2_


  - [x] 2.2 Write property test for HSL color constraints
    - **Property 9: HSL Color Constraints**
    - **Validates: Requirements 2.3, 7.1, 11.1**
    - Test that all generated colors have saturation ∈ [70, 100] and lightness ∈ [50, 70]

  - [x] 2.3 Implement perceptual color difference validation
    - Add ΔE (CIE76) calculation function
    - Implement color pair validation with minimum ΔE of 30
    - Add conflict resolution: adjust hue by +15° if ΔE < 30
    - Limit adjustment attempts to 10 iterations
    - _Requirements: 2.4, 11.4_

  - [x] 2.4 Write property test for minimum color difference
    - **Property 10: Minimum Color Difference**
    - **Validates: Requirements 2.4, 11.4**
    - Test that all color pairs have ΔE ≥ 30

  - [x] 2.5 Implement color format conversions
    - Create HSL to RGB conversion function
    - Create RGB to HEX conversion function
    - Create HEX to HSL conversion function (for cache deserialization)
    - Add TypeScript interfaces: HSLColor, RGBColor, NeonColor
    - _Requirements: 2.1_

  - [x] 2.6 Write property test for color persistence round trip
    - **Property 11: Color Persistence Round Trip**
    - **Validates: Requirements 2.5**
    - Test that serialization and deserialization preserve color values

- [ ] 3. Implement Pinia store for neon state
  - [x] 3.1 Create neon store with state management
    - Define NeonStoreState interface with colorMap, categories, config, loading, error
    - Implement reactive Map for category-to-color mappings
    - Add actions: fetchCategories, generateColors, getCategoryColor
    - Add getters: isLoading, error, colorMap
    - _Requirements: 8.6, 9.2_

  - [x] 3.2 Write unit tests for store actions
    - Test fetchCategories with mock Supabase responses
    - Test generateColors with various category counts
    - Test getCategoryColor with valid and invalid IDs

- [ ] 4. Implement localStorage caching system
  - [x] 4.1 Create cache serialization and deserialization
    - Implement ColorCache interface with version, timestamp, expiration, checksum
    - Create MD5 checksum function for category ID validation
    - Implement saveToCache() with 24-hour TTL
    - Implement loadFromCache() with expiration check
    - _Requirements: 2.5, 9.5_

  - [x] 4.2 Add cache invalidation logic
    - Compare checksums to detect category list changes
    - Implement cache expiration check (24 hours)
    - Clear cache on version mismatch
    - _Requirements: 9.6_

  - [x] 4.3 Write integration tests for cache persistence
    - Test cache save and load round trip
    - Test cache expiration after 24 hours
    - Test cache invalidation on category changes

- [-] 5. Checkpoint - Ensure all tests pass
  - Run all unit and property tests for Phase 1
  - Verify color generation produces valid HSL values
  - Confirm cache persistence works correctly
  - Ask the user if questions arise

### Phase 2: Rendering System

- [ ] 6. Implement Glow Effect Engine
  - [ ] 6.1 Create multi-layer shadow generation
    - Implement 3-layer shadow system (inner, middle, outer)
    - Create shadow CSS string generator with blur and spread parameters
    - Add intensity multiplier support (1.0, 1.3, 1.6, 1.4 for high contrast)
    - Implement GlowIntensity enum (DEFAULT, HOVER, ACTIVE, HIGH_CONTRAST)
    - _Requirements: 3.3, 3.5, 4.1, 4.2, 4.3, 6.4, 7.2_

  - [ ] 6.2 Add GPU acceleration optimization
    - Use will-change: transform, opacity for animated elements
    - Implement transform: translateZ(0) for GPU layer promotion
    - Avoid direct box-shadow animation (use opacity on pseudo-elements)
    - _Requirements: 5.1_

  - [ ] 6.3 Write property test for glow intensity levels
    - **Property 18-21: Glow Intensity States**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Test default, hover, active, and reset intensity values

- [ ] 7. Create CSS neon-effects.css
  - [ ] 7.1 Define CSS custom properties
    - Create --neon-color, --neon-intensity, --neon-blur, --neon-spread variables
    - Define --neon-transition with cubic-bezier(0.4, 0.0, 0.2, 1) easing
    - Add --neon-transition-duration variable
    - _Requirements: 4.5, 10.3_

  - [ ] 7.2 Implement neon text styles
    - Create .neon-text class with multi-layer text-shadow
    - Add .neon-text-hover and .neon-text-active variants
    - Implement dark outline with text-stroke for color bleeding prevention
    - _Requirements: 1.5, 3.2, 7.4_

  - [ ] 7.3 Implement neon border styles
    - Create .neon-border class with multi-layer box-shadow
    - Add .neon-border-hover and .neon-border-active variants
    - Implement semi-transparent background with rgba
    - _Requirements: 3.1, 3.4, 7.5_

  - [ ] 7.4 Add accessibility styles
    - Implement prefers-reduced-motion media query to disable transitions
    - Add high contrast mode styles with increased intensity
    - Ensure focus indicators are visible for keyboard navigation
    - _Requirements: 4.6, 6.3, 6.4, 6.6_

- [ ] 8. Build Vue composables
  - [ ] 8.1 Create useNeonColors composable
    - Implement getCategoryColor(categoryId) function
    - Add refreshColors() async function
    - Add previewAllColors() function for admin mode
    - Expose reactive isLoading and error computed properties
    - _Requirements: 8.4, 11.6_

  - [ ] 8.2 Write unit tests for useNeonColors
    - Test getCategoryColor with valid and invalid IDs
    - Test refreshColors triggers store action
    - Test reactive updates when color map changes

  - [ ] 8.3 Create useNeonGlow composable
    - Accept color Ref as parameter
    - Implement intensity state management
    - Create glowStyle computed property with CSS variables
    - Add setIntensity, onHover, onLeave, onActive methods
    - Integrate prefers-reduced-motion detection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [ ] 8.4 Write property test for reduced motion respect
    - **Property 23: Reduced Motion Respect**
    - **Validates: Requirements 4.6, 6.6**
    - Test that transitions are disabled when prefers-reduced-motion is enabled

  - [ ] 8.5 Create useNeonConfig composable
    - Expose reactive config computed property
    - Implement updateConfig(partial) function
    - Add resetToDefaults() function
    - Expose isEnabled computed property
    - _Requirements: 13.1, 13.3_

- [ ] 9. Implement browser capability detection
  - [ ] 9.1 Create capability detection system
    - Detect GPU acceleration support (transform property)
    - Detect CSS custom properties support
    - Detect CSS filters support (blur)
    - Detect backdrop-filter support
    - Store capabilities in config store
    - _Requirements: 15.4_

  - [ ] 9.2 Add graceful degradation logic
    - Disable complex glow effects if GPU unavailable
    - Fall back to inline styles if CSS custom properties unsupported
    - Use simple borders if filters unsupported
    - _Requirements: 12.3, 12.4, 15.3_

  - [ ] 9.3 Write unit tests for capability detection
    - Test detection with mocked browser APIs
    - Test fallback behavior for each unsupported feature

- [ ] 10. Checkpoint - Ensure all tests pass
  - Run all unit and property tests for Phase 2
  - Verify glow effects render correctly in browser
  - Confirm GPU acceleration is active
  - Test reduced motion and high contrast modes
  - Ask the user if questions arise

### Phase 3: Components

- [ ] 11. Build MapLabel component
  - [ ] 11.1 Create MapLabel.vue component structure
    - Define MapLabelProps interface (venue, zoomLevel, isVisible, color)
    - Define MapLabelEmits interface (click, hover)
    - Set up component template with neon text styling
    - Add data-testid attributes for testing
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 11.2 Implement positioning logic
    - Calculate pixel position from lat/lng using map projection
    - Apply 20px vertical offset above marker
    - Use position: absolute with CSS transform for GPU acceleration
    - Add pointer-events: auto for interactivity
    - _Requirements: 1.2_

  - [ ] 11.3 Add visibility and zoom level logic
    - Hide label if zoomLevel < 13
    - Hide label if outside viewport bounds (with 100px buffer)
    - Implement fade-in animation with 50ms stagger
    - _Requirements: 1.4, 10.4_

  - [ ] 11.4 Integrate useNeonColors and useNeonGlow
    - Get category color from useNeonColors composable
    - Apply glow effects using useNeonGlow composable
    - Handle hover and click events to change intensity
    - _Requirements: 1.3, 4.2, 4.3, 4.4_

  - [ ] 11.5 Write property tests for MapLabel rendering
    - **Property 1: Venue Label Rendering with Glow**
    - **Validates: Requirements 1.1**
    - Test that text-shadow is present for all rendered labels
    - **Property 3: Category Color Assignment**
    - **Validates: Requirements 1.3**
    - Test that label uses correct category color
    - **Property 4: Zoom Level Visibility Threshold**
    - **Validates: Requirements 1.4**
    - Test visibility based on zoom level

  - [ ] 11.6 Write unit tests for MapLabel interactions
    - Test hover event increases intensity
    - Test click event triggers emit
    - Test positioning calculation accuracy

- [ ] 12. Implement Label Priority Engine
  - [ ] 12.1 Create priority scoring algorithm
    - Implement calculatePriorityScore(venue, userLocation) function
    - Calculate distance score (40% weight)
    - Use venue importance score (40% weight)
    - Add category boost (20% weight) for popular categories
    - _Requirements: 5.3_

  - [ ] 12.2 Add label limiting logic
    - Sort venues by priority score
    - Limit visible labels to top 50
    - Implement smooth fade transitions when labels swap
    - Debounce recalculation on map pan/zoom (300ms)
    - _Requirements: 5.2, 5.3_

  - [ ] 12.3 Write property test for maximum visible labels
    - **Property 25: Maximum Visible Labels Limit**
    - **Validates: Requirements 5.2**
    - Test that no more than 50 labels are rendered simultaneously
    - **Property 26: Importance-Based Prioritization**
    - **Validates: Requirements 5.3**
    - Test that top 50 venues by priority are selected

- [ ] 13. Build NeonModal component
  - [ ] 13.1 Create NeonModal.vue component structure
    - Define NeonModalProps interface (venue, isOpen, color)
    - Define slots for header, content, footer
    - Set up modal template with neon border styling
    - Add backdrop with backdrop-filter: blur(8px)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 13.2 Implement modal animations
    - Add fade-in animation over 250ms
    - Add scale-up animation (0.95 → 1.0)
    - Increase glow intensity by 50% when opened
    - Use cubic-bezier easing for smooth transitions
    - _Requirements: 3.5, 10.5_

  - [ ] 13.3 Add keyboard navigation and accessibility
    - Implement focus trap within modal
    - Add Escape key to close
    - Ensure close button is keyboard accessible
    - Add ARIA labels (role="dialog", aria-modal="true")
    - _Requirements: 6.3, 6.5_

  - [ ] 13.4 Write property tests for NeonModal
    - **Property 13: Modal Border Color Matching**
    - **Validates: Requirements 3.1**
    - Test that border color matches venue category color
    - **Property 17: Modal Glow Intensity Increase**
    - **Validates: Requirements 3.5**
    - Test that opened modal has 1.5x intensity

  - [ ] 13.5 Write unit tests for modal interactions
    - Test modal opens and closes correctly
    - Test Escape key closes modal
    - Test focus trap works
    - Test click outside closes modal

- [ ] 14. Build NeonCard component
  - [ ] 14.1 Create NeonCard.vue component
    - Define NeonCardProps interface (venue, color, variant)
    - Support 'compact' and 'detailed' variants
    - Apply neon border styling
    - Add hover effect with intensity increase
    - _Requirements: 3.1, 4.2_

  - [ ] 14.2 Write unit tests for NeonCard
    - Test both compact and detailed variants render
    - Test hover increases glow intensity
    - Test color prop is applied correctly

- [ ] 15. Checkpoint - Ensure all tests pass
  - Run all unit and property tests for Phase 3
  - Verify MapLabel renders correctly on map
  - Test NeonModal opens with correct styling
  - Confirm keyboard navigation works
  - Ask the user if questions arise

### Phase 4: Accessibility & Performance

- [ ] 16. Implement accessibility features
  - [ ] 16.1 Add ARIA labels and screen reader support
    - Add aria-label to all MapLabel components
    - Add alt text for venue information
    - Ensure all interactive elements have accessible names
    - Test with screen reader (manual verification recommended)
    - _Requirements: 6.5_

  - [ ] 16.2 Implement responsive font scaling
    - Add media query for screens < 768px
    - Set minimum font size to 14px on mobile
    - Test on various device sizes
    - _Requirements: 6.2_

  - [ ] 16.3 Add high contrast mode support
    - Detect high contrast mode preference
    - Increase glow intensity by 40% (1.4x multiplier)
    - Ensure minimum contrast ratio of 4.5:1
    - _Requirements: 6.4_

  - [ ] 16.4 Write property tests for accessibility
    - **Property 28: WCAG Compliance**
    - **Validates: Requirements 6.1**
    - Test contrast ratios meet WCAG 2.1 AA standards
    - **Property 29: Responsive Font Scaling**
    - **Validates: Requirements 6.2**
    - Test font size is at least 14px on mobile
    - **Property 31: High Contrast Mode Intensity**
    - **Validates: Requirements 6.4**
    - Test intensity increases by 1.4x in high contrast mode

  - [ ] 16.5 Run accessibility audit
    - Use jest-axe to check for WCAG violations
    - Test keyboard navigation flows
    - Verify focus indicators are visible

- [ ] 17. Optimize performance
  - [ ] 17.1 Implement performance monitoring
    - Add FPS measurement during map pan/zoom
    - Measure initial render time impact
    - Track number of simultaneously rendered labels
    - _Requirements: 5.4, 5.5_

  - [ ] 17.2 Optimize rendering pipeline
    - Ensure GPU acceleration is active (verify will-change)
    - Limit simultaneous animations to 50 elements
    - Use requestAnimationFrame for smooth updates
    - Implement viewport culling with 100px buffer
    - _Requirements: 5.1, 5.2_

  - [ ] 17.3 Write performance tests
    - **Property 24: GPU-Accelerated Properties**
    - **Validates: Requirements 5.1**
    - Test that glow elements use GPU-accelerated CSS properties
    - **Property 27: Color Cache Initialization**
    - **Validates: Requirements 5.6**
    - Test that colors are cached before first render
    - Test that 50 labels render within 100ms budget
    - Test that FPS remains above 30 during map interactions

- [ ] 18. Checkpoint - Ensure all tests pass
  - Run all accessibility and performance tests
  - Verify WCAG 2.1 AA compliance
  - Confirm 30+ FPS performance
  - Test on multiple devices and browsers
  - Ask the user if questions arise

### Phase 5: Integration & Polish

- [ ] 19. Integrate with Supabase database
  - [ ] 19.1 Implement category fetching
    - Create fetchCategories() function in neon store
    - Query venue_categories table on app initialization
    - Handle database connection errors with retry logic (3 attempts, exponential backoff)
    - _Requirements: 9.1_

  - [ ] 19.2 Create category-to-color mapping
    - Generate colors for all fetched categories
    - Store mapping in Pinia store
    - Save to localStorage cache
    - _Requirements: 9.2_

  - [ ] 19.3 Add database index for performance
    - Create index on venues(category_id, importance_score DESC)
    - Verify query performance improvement
    - _Requirements: 5.6_

  - [ ] 19.4 Write integration tests for database
    - Test category fetching from Supabase
    - Test error handling on connection failure
    - Test retry logic with exponential backoff

- [ ] 20. Implement comprehensive error handling
  - [ ] 20.1 Add data loading error handlers
    - Catch database connection failures
    - Use fallback color palette (10 predefined colors)
    - Set error state in Pinia store
    - Log detailed errors to console
    - _Requirements: 12.1, 12.5_

  - [ ] 20.2 Add color generation error handlers
    - Validate constraints before generation
    - Accept best result after 10 adjustment attempts
    - Handle corrupted cache gracefully
    - _Requirements: 12.5_

  - [ ] 20.3 Add rendering error handlers
    - Handle missing DOM elements safely
    - Implement graceful degradation for unsupported browsers
    - Render venue names without styling on critical errors
    - _Requirements: 12.6_

  - [ ] 20.4 Add configuration error handlers
    - Validate config with Zod schema on startup
    - Replace invalid values with defaults
    - Log warnings for each invalid value
    - _Requirements: 13.4_

  - [ ] 20.5 Write unit tests for error scenarios
    - Test fallback palette on database error
    - Test default color for venue without category
    - Test graceful degradation on GPU unavailable
    - Test config validation with invalid values

- [ ] 21. Add configuration validation
  - [ ] 21.1 Create Zod validation schema
    - Define schema for NeonConfig with all nested objects
    - Add min/max constraints for numeric values
    - Validate on application startup
    - _Requirements: 13.5_

  - [ ] 21.2 Implement manual color overrides
    - Support category-specific color overrides in config
    - Override generated colors when specified
    - Validate override colors meet HSL constraints
    - _Requirements: 13.2_

  - [ ] 21.3 Write property tests for configuration
    - **Property 48: Manual Color Override Support**
    - **Validates: Requirements 13.2**
    - Test that override colors are used instead of generated colors
    - **Property 49: Feature Flag Toggle**
    - **Validates: Requirements 13.3**
    - Test that no effects are applied when feature is disabled
    - **Property 50: Configuration Validation**
    - **Validates: Requirements 13.5**
    - Test that invalid config values are rejected

- [ ] 22. Create admin preview mode
  - [ ] 22.1 Build color preview interface
    - Create admin page to display all category colors
    - Show color swatches with hex, HSL, and RGB values
    - Add visual preview of glow effects
    - Allow manual color override input
    - _Requirements: 11.6_

  - [ ] 22.2 Write unit tests for admin preview
    - Test that all categories are displayed
    - Test color override functionality

- [ ] 23. Checkpoint - Ensure all tests pass
  - Run all integration tests
  - Verify database integration works correctly
  - Test error handling with simulated failures
  - Confirm admin preview mode displays correctly
  - Ask the user if questions arise

### Phase 6: Testing & Documentation

- [ ] 24. Complete property-based tests
  - [ ] 24.1 Write remaining color generation properties
    - **Property 7: Unique Category Colors**
    - **Validates: Requirements 2.1**
    - **Property 8: Complete Category Coverage**
    - **Validates: Requirements 2.2, 9.2**
    - **Property 12: Dynamic Category Color Generation**
    - **Validates: Requirements 2.6**
    - **Property 45: Red Spectrum Exclusion**
    - **Validates: Requirements 11.2**
    - **Property 46: Color Spectrum Diversity**
    - **Validates: Requirements 11.3**
    - **Property 47: Blur Radius Range**
    - **Validates: Requirements 11.5**

  - [ ] 24.2 Write remaining rendering properties
    - **Property 2: Label Positioning Above Marker**
    - **Validates: Requirements 1.2**
    - **Property 5: Text Shadow Glow Presence**
    - **Validates: Requirements 1.5**
    - **Property 6: Minimum Contrast Ratio**
    - **Validates: Requirements 1.6**
    - **Property 14: Modal Header Neon Styling**
    - **Validates: Requirements 3.2**
    - **Property 15: Modal Box Shadow Application**
    - **Validates: Requirements 3.3**
    - **Property 16: Modal Background Transparency**
    - **Validates: Requirements 3.4, 7.5**

  - [ ] 24.3 Write remaining interaction properties
    - **Property 22: Transition Easing Function**
    - **Validates: Requirements 4.5, 10.3**
    - **Property 41: CSS Transition Presence**
    - **Validates: Requirements 10.1**
    - **Property 42: Transition Duration Range**
    - **Validates: Requirements 10.2**
    - **Property 43: Staggered Label Fade-In**
    - **Validates: Requirements 10.4**
    - **Property 44: Modal Opening Animation**
    - **Validates: Requirements 10.5**

  - [ ] 24.4 Write remaining system properties
    - **Property 30: Keyboard Navigation Support**
    - **Validates: Requirements 6.3**
    - **Property 32: Screen Reader Accessibility**
    - **Validates: Requirements 6.5**
    - **Property 33: Multi-Layer Shadow Depth**
    - **Validates: Requirements 7.2**
    - **Property 34: Warm White Usage**
    - **Validates: Requirements 7.3**
    - **Property 35: Label Dark Outline**
    - **Validates: Requirements 7.4**
    - **Property 36: Minimum Brightness Difference**
    - **Validates: Requirements 7.6**
    - **Property 37: Reactive Composable**
    - **Validates: Requirements 8.4**
    - **Property 38: Category Data Initialization**
    - **Validates: Requirements 9.1**
    - **Property 39: localStorage Cache with Expiration**
    - **Validates: Requirements 9.5**
    - **Property 40: Cache Invalidation on Category Change**
    - **Validates: Requirements 9.6**
    - **Property 51: Error Logging**
    - **Validates: Requirements 12.5**
    - **Property 52: Vendor Prefix Presence**
    - **Validates: Requirements 15.2**
    - **Property 53: Browser Capability Detection**
    - **Validates: Requirements 15.4**

  - [ ] 24.5 Run all property tests with 100 iterations
    - Configure fast-check with numRuns: 100
    - Verify all 53 properties pass
    - Document any failing examples for debugging

- [ ] 25. Visual regression testing
  - [ ] 25.1 Set up Playwright visual tests
    - Create visual test suite for map labels
    - Create visual test suite for neon modals
    - Create visual test suite for hover states
    - Store baseline screenshots

  - [ ] 25.2 Run visual regression tests
    - Test default glow appearance
    - Test hover state glow increase
    - Test active state glow increase
    - Test high contrast mode
    - Compare against baseline screenshots

- [ ] 26. Performance benchmarking
  - [ ] 26.1 Create performance benchmark suite
    - Measure initial render time impact
    - Measure FPS during map pan/zoom
    - Measure color generation time
    - Measure cache load time

  - [ ] 26.2 Run performance benchmarks
    - Verify initial render adds < 100ms
    - Verify FPS stays above 30
    - Verify 50 labels render within budget
    - Document performance metrics

- [ ] 27. Write developer documentation
  - [ ] 27.1 Create API documentation
    - Document all composables (useNeonColors, useNeonGlow, useNeonConfig)
    - Document Category Color Engine API
    - Document Glow Effect Engine API
    - Document Label Priority Engine API
    - Add TypeScript type definitions and JSDoc comments

  - [ ] 27.2 Create integration guide
    - Document how to integrate MapLabel into map components
    - Document how to use NeonModal and NeonCard
    - Provide code examples for common use cases
    - Document configuration options

  - [ ] 27.3 Create troubleshooting guide
    - Document common issues and solutions
    - Document browser compatibility notes
    - Document performance optimization tips
    - Document error messages and their meanings

- [ ] 28. Create user guide for administrators
  - [ ] 28.1 Write admin configuration guide
    - Document all configuration parameters
    - Explain how to adjust glow intensity, blur radius, transition timing
    - Document how to use manual color overrides
    - Document how to enable/disable the feature

  - [ ] 28.2 Write color preview guide
    - Document how to access admin preview mode
    - Explain how to review all category colors
    - Document how to test color changes before deployment

- [ ] 29. Final checkpoint - Complete validation
  - Run full test suite (unit + property + integration + visual + E2E)
  - Verify all 53 correctness properties pass with 100 runs each
  - Confirm WCAG 2.1 AA compliance with accessibility audit
  - Verify 30+ FPS performance on target devices
  - Test on all supported browsers (Chrome, Firefox, Safari, Edge)
  - Review all documentation for completeness
  - Ask the user if questions arise before marking complete

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property-based tests validate universal correctness properties using fast-check
- Unit tests validate specific examples, edge cases, and error conditions
- All tests should be run with `bun test` before marking tasks complete
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- Implementation uses TypeScript for type safety throughout
- GPU acceleration is critical for performance - verify with browser DevTools
- Accessibility compliance is mandatory - use jest-axe and manual testing
- Visual regression tests prevent unintended styling changes
- Documentation is essential for maintainability and team onboarding

---

## Success Criteria

The Neon Venue Signs System implementation is complete when:

1. ✅ All 53 correctness properties pass with 100 test runs each
2. ✅ Unit test coverage reaches 90% for core engines and composables
3. ✅ WCAG 2.1 AA compliance verified with automated and manual testing
4. ✅ Performance benchmarks met: 30+ FPS, < 100ms initial render impact
5. ✅ All supported browsers render effects correctly (Chrome, Firefox, Safari, Edge)
6. ✅ Error handling gracefully degrades on failures
7. ✅ Documentation complete for developers and administrators
8. ✅ Visual regression tests pass with no unexpected changes
9. ✅ Integration with Supabase database works correctly
10. ✅ Admin preview mode allows color review and configuration

**Total Tasks**: 29 top-level tasks with 100+ sub-tasks
**Estimated Timeline**: 6 weeks (following phased roadmap)
**Testing Coverage**: 53 properties + unit tests + integration tests + visual tests + E2E tests
