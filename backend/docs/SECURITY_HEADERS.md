# Security Headers Documentation

**Task 4 (E1): Content Security Policy Implementation**

This document describes the security headers implementation for VibeCity API, including Content Security Policy (CSP), violation reporting, testing, and monitoring.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Security Headers](#security-headers)
3. [Content Security Policy](#content-security-policy)
4. [CSP Violation Reporting](#csp-violation-reporting)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The VibeCity API implements comprehensive security headers to protect against common web vulnerabilities:

- **Content Security Policy (CSP)**: Prevents XSS and data injection attacks
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME sniffing
- **X-XSS-Protection**: Enables browser XSS filters (legacy)
- **Strict-Transport-Security (HSTS)**: Forces HTTPS connections
- **Referrer-Policy**: Controls referrer information leakage
- **Permissions-Policy**: Controls browser feature access

---

## Security Headers

### Implementation

Security headers are implemented via `SecurityHeadersMiddleware` in `backend/app/middleware/security.py`.

```python
from app.middleware.security import SecurityHeadersMiddleware

app.add_middleware(
    SecurityHeadersMiddleware,
    env=settings.ENV,
    csp_report_uri=f"{settings.API_V1_STR}/security/csp-report"
)
```

### Headers Applied

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | See [CSP section](#content-security-policy) | Prevent XSS and injection attacks |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Enable XSS filter (legacy browsers) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS for 1 year |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information |
| `Permissions-Policy` | `geolocation=(self), microphone=(), camera=()` | Control browser features |

---

## Content Security Policy

### CSP Directives

The CSP is configured to allow necessary third-party services while maintaining security:

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://api.mapbox.com https://www.clarity.ms;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com https://*.tile.openstreetmap.org https://api.mapbox.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.mapbox.com https://events.mapbox.com https://api.stripe.com https://*.sentry.io https://*.clarity.ms https://*.vercel-insights.com;
worker-src 'self' blob:;
frame-src https://js.stripe.com https://hooks.stripe.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
report-uri /api/v1/security/csp-report;
report-to csp-endpoint;
```

### Environment-Aware Configuration

The CSP configuration adapts based on environment:

- **Production**: Strict CSP with `upgrade-insecure-requests`
- **Development**: Allows `unsafe-inline` and `unsafe-eval` for hot reload

### Allowed Third-Party Services

| Service | Directives | Purpose |
|---------|-----------|---------|
| Stripe | `script-src`, `frame-src`, `connect-src` | Payment processing |
| Mapbox | `script-src`, `style-src`, `img-src`, `connect-src` | Map rendering |
| Supabase | `img-src`, `connect-src` | Database and storage |
| Sentry | `connect-src` | Error tracking |
| Microsoft Clarity | `script-src`, `connect-src` | Analytics |
| Vercel Insights | `connect-src` | Performance monitoring |

### Improving CSP Security

**Current Issues:**
- `'unsafe-inline'` in `script-src` and `style-src`
- `'unsafe-eval'` in `script-src` (required by Mapbox)

**Recommendations:**
1. Replace `'unsafe-inline'` with nonces or hashes
2. Use CSP Level 3 `'strict-dynamic'` for scripts
3. Evaluate if Mapbox can work without `'unsafe-eval'`

---

## CSP Violation Reporting

### Reporting Endpoint

CSP violations are automatically reported to:
```
POST /api/v1/security/csp-report
```

The endpoint accepts both legacy and modern CSP report formats.

### Violation Data Structure

```json
{
  "timestamp": "2026-03-16T10:30:00Z",
  "user_agent": "Mozilla/5.0...",
  "ip_address": "192.168.1.1",
  "violation": {
    "document-uri": "https://vibecity.live/map",
    "violated-directive": "script-src",
    "blocked-uri": "https://evil.com/malicious.js",
    "source-file": "https://vibecity.live/app.js",
    "line-number": 42,
    "column-number": 15
  }
}
```

### Accessing Violations

**Get Recent Violations:**
```bash
GET /api/v1/security/csp-violations?limit=100&directive=script-src
```

**Get Statistics:**
```bash
GET /api/v1/security/csp-violations/stats
```

**Clear Violations:**
```bash
DELETE /api/v1/security/csp-violations
```

### Storage

Currently, violations are stored in-memory (last 1000 violations). For production:

**Recommended Improvements:**
1. Store violations in database (PostgreSQL or TimescaleDB)
2. Set up log aggregation (Loki, Elasticsearch)
3. Configure alerting for high violation rates
4. Implement violation deduplication

---

## Testing

### CSP Evaluator Script

Test CSP configuration using the included script:

```bash
python backend/scripts/test_csp.py http://localhost:8000
```

**Output:**
```
================================================================================
CSP Test Results for: http://localhost:8000
================================================================================

Status Code: 200

📋 Security Headers:
--------------------------------------------------------------------------------
✅ Content-Security-Policy: default-src 'self'; script-src...
✅ X-Frame-Options: DENY
✅ X-Content-Type-Options: nosniff
✅ X-XSS-Protection: 1; mode=block
✅ Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
✅ Referrer-Policy: strict-origin-when-cross-origin
✅ Permissions-Policy: geolocation=(self), microphone=(), camera=()

🎯 CSP Grade: C

⚠️  CSP Findings (2 issues):
--------------------------------------------------------------------------------

🔴 HIGH: script-src allows 'unsafe-inline'
   Directive: script-src
   Description: Inline scripts/styles are allowed, which can lead to XSS vulnerabilities
   Recommendation: Use nonces or hashes instead of 'unsafe-inline'

🔴 HIGH: script-src allows 'unsafe-eval'
   Directive: script-src
   Description: eval() and similar functions are allowed, which can lead to code injection
   Recommendation: Remove 'unsafe-eval' if possible, or use Web Workers
```

### JSON Output

For CI/CD integration:
```bash
python backend/scripts/test_csp.py http://localhost:8000 --json
```

### Automated Testing

Add to CI/CD pipeline:
```yaml
# .github/workflows/security.yml
- name: Test CSP Configuration
  run: |
    python backend/scripts/test_csp.py http://localhost:8000
```

### Manual Testing

**Test CSP in Browser:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Try to execute inline script:
   ```javascript
   eval('console.log("test")')
   ```
4. Check for CSP violation errors

**Test with curl:**
```bash
curl -I http://localhost:8000 | grep -i "content-security-policy"
```

---

## Monitoring

### Real-Time Dashboard

Monitor CSP violations in real-time:

```bash
python backend/scripts/csp_monitor.py http://localhost:8000
```

**Dashboard Output:**
```
================================================================================
🛡️  CSP Violation Monitoring Dashboard
================================================================================
Last Updated: 2026-03-16 10:30:45

📊 Total Violations: 42

📈 Violations by Directive:
--------------------------------------------------------------------------------
  script-src                        25 █████████████████████████
  style-src                         12 ████████████
  img-src                            5 █████

🚫 Top Blocked URIs:
--------------------------------------------------------------------------------
     15x https://evil.com/malicious.js
      8x inline
      4x eval

📄 Top Source Files:
--------------------------------------------------------------------------------
     20x https://vibecity.live/app.js
      5x https://vibecity.live/map.js

🔴 Recent Violations (last 5):
--------------------------------------------------------------------------------

  Time: 2026-03-16T10:30:00Z
  Directive: script-src
  Blocked: https://evil.com/malicious.js
  Document: https://vibecity.live/map
```

### Export Violations

Export violations for analysis:
```bash
python backend/scripts/csp_monitor.py http://localhost:8000 --export violations.json
```

### Alerting

**Set up alerts for:**
- High violation rate (>100/hour)
- New blocked URIs (potential attacks)
- Violations from production domains

**Integration Options:**
- PagerDuty
- Slack webhooks
- Email notifications
- Datadog monitors

---

## Best Practices

### 1. Start with Report-Only Mode

Before enforcing CSP, test with `Content-Security-Policy-Report-Only`:

```python
response.headers["Content-Security-Policy-Report-Only"] = csp_header
```

This reports violations without blocking content.

### 2. Monitor Violations Regularly

- Review violations weekly
- Investigate new blocked URIs
- Update CSP as needed

### 3. Use Nonces for Inline Scripts

Instead of `'unsafe-inline'`:

```html
<!-- Generate nonce per request -->
<script nonce="random-nonce-123">
  console.log('Safe inline script');
</script>
```

```python
# In CSP header
script-src 'self' 'nonce-random-nonce-123'
```

### 4. Implement Subresource Integrity (SRI)

For third-party scripts:

```html
<script 
  src="https://cdn.example.com/library.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/ux..."
  crossorigin="anonymous">
</script>
```

### 5. Test Across All Pages

CSP violations may only appear on specific pages. Test:
- Homepage
- Map view
- Payment flow
- Admin panel
- Mobile views

### 6. Keep CSP Updated

When adding new third-party services:
1. Add to CSP directives
2. Test in staging
3. Monitor for violations
4. Deploy to production

---

## Troubleshooting

### Common Issues

#### Issue: Inline scripts blocked

**Symptom:** JavaScript not executing, console shows CSP violation

**Solution:**
1. Use external script files instead of inline
2. Or add nonces to inline scripts
3. Or use `'unsafe-inline'` (not recommended)

#### Issue: Third-party service blocked

**Symptom:** Maps/payments not loading, CSP violation in console

**Solution:**
1. Identify blocked domain from violation report
2. Add domain to appropriate CSP directive
3. Test and deploy

#### Issue: Styles not loading

**Symptom:** Page appears unstyled

**Solution:**
1. Check `style-src` directive
2. Add missing domains (e.g., Google Fonts)
3. Consider using `'unsafe-inline'` for styles (lower risk than scripts)

#### Issue: WebSocket connections blocked

**Symptom:** Real-time features not working

**Solution:**
1. Add WebSocket URLs to `connect-src`
2. Include both `https://` and `wss://` protocols

### Debug Mode

Enable CSP debug logging:

```python
import logging
logging.getLogger("app.middleware.security").setLevel(logging.DEBUG)
```

### Browser Tools

**Chrome DevTools:**
- Console tab shows CSP violations
- Network tab shows blocked requests
- Security tab shows security overview

**Firefox DevTools:**
- Console tab shows detailed CSP violations
- Network tab shows blocked requests

---

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [OWASP: Content Security Policy](https://owasp.org/www-community/controls/Content_Security_Policy)
- [Security Headers](https://securityheaders.com/)

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-16  
**Task:** 4 (E1) - Content Security Policy  
**Owner:** Security Team
