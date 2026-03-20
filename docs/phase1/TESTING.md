# Phase 1 Testing Guide

## Overview

Phase 1 includes comprehensive testing for all systems.

## Test Statistics

- **Total Tests**: 114
- **Passing**: 114 (100%)
- **Coverage**: Comprehensive
- **Test Files**: 25

## Running Tests

### All Tests

```bash
bun test
# or
bunx vitest run
```

### Specific Test File

```bash
bunx vitest run tests/unit/usePerformanceMonitor.spec.js
```

### Watch Mode

```bash
bun run test:unit
```

### Coverage

```bash
bun run test:unit:coverage
```

## Test Structure

### Unit Tests

Located in `tests/unit/`:

- `useMapPerformance.spec.js` - Performance monitoring tests
- `useRealtimeFeatures.spec.js` - Real-time features tests
- `useEnhancedMarkers.spec.js` - Enhanced markers tests
- `useAdvancedNeonEffects.spec.js` - Neon effects tests
- And 21 more test files...

### Test Example

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePerformanceMonitor } from '@/utils/performance/performanceMonitor';

describe('usePerformanceMonitor', () => {
  let perfMonitor;

  beforeEach(() => {
    perfMonitor = usePerformanceMonitor();
  });

  it('should start monitoring', () => {
    perfMonitor.start();
    expect(perfMonitor.isMonitoring).toBe(true);
  });

  it('should record custom metrics', () => {
    perfMonitor.recordCustomMetric('test_metric', 100);
    const metrics = perfMonitor.getMetrics();
    expect(metrics.custom.test_metric).toBeDefined();
  });
});
```

## Validation Checklist

Run the master checklist:

```bash
python .agent/scripts/checklist.py .
```

This runs:
1. Security Scan
2. Lint Check
3. Schema Validation
4. Test Runner
5. UX Audit
6. SEO Check

All must pass for production deployment.

