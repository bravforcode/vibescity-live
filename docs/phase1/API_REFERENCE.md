# Phase 1 API Reference

## Performance Monitor

### `usePerformanceMonitor(options)`

Creates and returns a performance monitoring instance.

**Parameters:**
- `options` (Object): Configuration options
  - `enableFPS` (Boolean): Enable FPS monitoring (default: true)
  - `enableMemory` (Boolean): Enable memory monitoring (default: true)
  - `enableNetwork` (Boolean): Enable network monitoring (default: true)
  - `enableWebVitals` (Boolean): Enable Web Vitals (default: true)
  - `sampleRate` (Number): Sampling rate 0-1 (default: 1.0)
  - `reportInterval` (Number): Report interval in ms (default: 30000)
  - `budgets` (Object): Performance budgets
  - `onMetric` (Function): Callback for metrics
  - `onBudgetExceeded` (Function): Callback for budget violations

**Returns:** `PerformanceMonitor` instance

**Methods:**

#### `start()`
Starts performance monitoring.

```javascript
const perfMonitor = usePerformanceMonitor();
perfMonitor.start();
```

#### `stop()`
Stops performance monitoring.

```javascript
perfMonitor.stop();
```

#### `recordCustomMetric(name, value, metadata)`
Records a custom metric.

**Parameters:**
- `name` (String): Metric name
- `value` (Number): Metric value
- `metadata` (Object): Additional metadata

```javascript
perfMonitor.recordCustomMetric('api_call_duration', 150, {
  endpoint: '/api/venues',
  method: 'GET'
});
```

#### `mark(name)`
Creates a performance mark.

```javascript
perfMonitor.mark('operation_start');
```

#### `measure(name, startMark, endMark)`
Measures time between marks.

```javascript
perfMonitor.mark('operation_start');
// ... operation ...
perfMonitor.mark('operation_end');
perfMonitor.measure('operation_duration', 'operation_start', 'operation_end');
```

#### `getMetrics()`
Returns current metrics.

**Returns:** Object with current metrics

```javascript
const metrics = perfMonitor.getMetrics();
console.log(metrics.fps); // Average FPS
console.log(metrics.memory); // Current memory usage
console.log(metrics.webVitals); // Web Vitals
```

