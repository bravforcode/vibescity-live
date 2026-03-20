# Phase 1 Troubleshooting Guide

## Common Issues

### Performance Monitor Not Starting

**Symptom**: Performance monitoring doesn't start

**Solutions**:
1. Check if browser supports Performance API
2. Verify `enablePerformanceMonitoring: true` in config
3. Check console for errors

```javascript
// Debug
const perfMonitor = usePerformanceMonitor({ debug: true });
perfMonitor.start();
```

### Analytics Not Tracking

**Symptom**: Events not being tracked

**Solutions**:
1. Verify analytics providers are loaded
2. Check network tab for analytics requests
3. Ensure `enableAnalytics: true`

```javascript
// Debug
const analytics = useAnalytics({ debug: true });
analytics.track('test_event', { test: true });
```

### Service Worker Not Registering

**Symptom**: Service worker fails to register

**Solutions**:
1. Ensure HTTPS (required for SW)
2. Check SW file exists at `/sw.js`
3. Verify browser support

```javascript
// Debug
const swManager = useServiceWorkerManager({
  swUrl: '/sw.js',
  onError: (error) => console.error('SW Error:', error),
});
```

### Memory Leaks

**Symptom**: Memory usage keeps increasing

**Solutions**:
1. Check for uncleared intervals/timeouts
2. Ensure cleanup on component unmount
3. Use memory profiler

```javascript
// Proper cleanup
onUnmounted(() => {
  perfMonitor.stop();
  healthCheck.stop();
  analytics.cleanup();
});
```

### High FPS Drop

**Symptom**: FPS drops below 30

**Solutions**:
1. Check performance mode
2. Reduce active animations
3. Enable LOD (Level of Detail)

```javascript
const perfMonitor = usePerformanceMonitor();
const metrics = perfMonitor.getMetrics();

if (metrics.fps < 30) {
  // Reduce quality
  performanceMode.value = 'low';
}
```

## Error Messages

### "Performance API not available"

Browser doesn't support Performance API. Fallback to basic monitoring.

### "Service Worker registration failed"

Check:
- HTTPS enabled
- SW file exists
- No syntax errors in SW

### "Analytics endpoint unreachable"

Check:
- Network connectivity
- API endpoint URL
- CORS configuration

## Debug Mode

Enable debug mode for all systems:

```javascript
app.use(MasterIntegration, {
  phase1: {
    performanceOptions: { debug: true },
    analyticsOptions: { debug: true },
    errorOptions: { debug: true },
    healthOptions: { debug: true },
    swOptions: { debug: true },
  },
});
```

## Getting Help

1. Check documentation in `docs/phase1/`
2. Review test files for usage examples
3. Check browser console for errors
4. Enable debug mode for detailed logs

