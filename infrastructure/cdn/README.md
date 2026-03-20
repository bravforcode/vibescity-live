# Multi-Region CDN Strategy - Implementation Guide

This directory contains the complete implementation of the Multi-Region CDN Strategy for VibeCity's enterprise transformation.

## 📋 Overview

The CDN implementation provides:
- **Edge caching** with Cloudflare Workers
- **Geo-routing** for optimal performance across regions
- **Cache invalidation** via webhooks
- **Cache warming** for critical pages
- **Performance monitoring** and testing tools

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CDN Architecture                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  User Request                                            │
│       ↓                                                  │
│  Cloudflare Edge (Global)                                │
│       ↓                                                  │
│  Cloudflare Worker (Edge Caching)                        │
│       ↓                                                  │
│  Cache Check                                             │
│       ├─ HIT → Return cached response                    │
│       └─ MISS → Fetch from origin                        │
│                                                          │
│  Geo-Routing Logic                                       │
│       ├─ Asia → asia.api.vibecity.live                   │
│       ├─ Europe → eu.api.vibecity.live                   │
│       ├─ US → us.api.vibecity.live                       │
│       └─ Default → api.vibecity.live                     │
│                                                          │
│  Origin Response                                         │
│       ↓                                                  │
│  Cache Storage (if cacheable)                            │
│       ↓                                                  │
│  Return to User                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 📁 Files

### Core Implementation
- **`cloudflare-worker.js`** - Main Cloudflare Worker code
  - Edge caching logic
  - Geo-routing implementation
  - Cache invalidation handler
  - Cache warming handler

- **`wrangler.toml`** - Cloudflare Workers configuration
  - Environment settings
  - Origin URLs
  - Secrets configuration

- **`cache-policies.yaml`** - Cache policy definitions
  - TTL settings per asset type
  - Cache invalidation rules
  - Cache warming configuration
  - Geo-routing rules

### Deployment & Management
- **`deploy.sh`** - Deployment script
  - Prerequisites checking
  - Secret management
  - Worker deployment
  - Testing utilities

- **`cache-purge-webhook.py`** - Cache management tool
  - Purge cache by patterns
  - Warm cache for critical pages
  - CLI interface

- **`test-cdn-performance.py`** - Performance testing tool
  - Latency measurement
  - Cache hit rate analysis
  - Multi-region testing

## 🚀 Quick Start

### Prerequisites

1. **Cloudflare Account**
   - Sign up at https://cloudflare.com
   - Get your Account ID from dashboard

2. **Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

3. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

### Configuration

1. **Update `wrangler.toml`**
   ```toml
   account_id = "your-account-id-here"
   
   [env.production.vars]
   ORIGIN_PRIMARY = "https://api.vibecity.live"
   ORIGIN_ASIA = "https://asia.api.vibecity.live"
   ORIGIN_EU = "https://eu.api.vibecity.live"
   ORIGIN_US = "https://us.api.vibecity.live"
   ```

2. **Set Secrets**
   ```bash
   # Generate random secrets
   openssl rand -hex 32  # For CACHE_PURGE_SECRET
   openssl rand -hex 32  # For CACHE_WARM_SECRET
   
   # Set secrets
   wrangler secret put CACHE_PURGE_SECRET --env production
   wrangler secret put CACHE_WARM_SECRET --env production
   ```

### Deployment

#### Option 1: Using Deploy Script (Recommended)

```bash
# Deploy to staging
./deploy.sh --env staging

# Deploy to production
./deploy.sh --env production

# Set secrets only
./deploy.sh --env production --secrets
```

#### Option 2: Manual Deployment

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Configure Routes

After deployment, configure routes in Cloudflare dashboard:

1. Go to **Workers & Pages** → **Your Worker**
2. Click **Triggers** → **Add Route**
3. Add routes:
   - `vibecity.live/*`
   - `www.vibecity.live/*`
   - `*.vibecity.live/*`

## 🔧 Cache Management

### Purge Cache

```bash
# Install dependencies
pip install requests

# Purge all cache
python cache-purge-webhook.py purge \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_PURGE_SECRET \
  --type all

# Purge static assets only
python cache-purge-webhook.py purge \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_PURGE_SECRET \
  --type static

# Purge API cache
python cache-purge-webhook.py purge \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_PURGE_SECRET \
  --type api

# Purge specific patterns
python cache-purge-webhook.py purge \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_PURGE_SECRET \
  --type patterns \
  --patterns "^/api/v1/shops.*" "^/api/v1/venues.*"
```

### Warm Cache

```bash
# Warm critical pages
python cache-purge-webhook.py warm \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_WARM_SECRET \
  --type critical

# Warm specific URLs
python cache-purge-webhook.py warm \
  --worker-url https://your-worker.workers.dev \
  --secret YOUR_CACHE_WARM_SECRET \
  --type patterns \
  --urls "/" "/map" "/api/v1/shops?province=Bangkok"
```

## 📊 Performance Testing

### Basic Performance Test

```bash
# Install dependencies
pip install requests

# Test CDN performance
python test-cdn-performance.py \
  --url https://vibecity.live \
  --test-urls "/" "/map" "/api/v1/shops" \
  --iterations 10
```

### Cache Effectiveness Test

```bash
# Test cache hit rates
python test-cdn-performance.py \
  --url https://vibecity.live \
  --test-urls "/" "/api/v1/shops" \
  --cache-test \
  --iterations 5
```

### Multi-Region Testing

To test from different regions, use a VPN or cloud instances:

```bash
# From Asia
python test-cdn-performance.py \
  --url https://vibecity.live \
  --location asia \
  --iterations 10

# From Europe
python test-cdn-performance.py \
  --url https://vibecity.live \
  --location europe \
  --iterations 10

# From US
python test-cdn-performance.py \
  --url https://vibecity.live \
  --location us \
  --iterations 10
```

## 🎯 Cache Policies

### Static Assets (1 year)
- JavaScript files (`.js`)
- CSS files (`.css`)
- Fonts (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`)
- Images (`.jpg`, `.png`, `.gif`, `.svg`, `.webp`, `.avif`)
- Videos (`.mp4`, `.webm`, `.ogg`)

### API Responses (5 minutes)
- `/api/v1/shops`
- `/api/v1/venues`
- `/api/v1/analytics`

### HTML Pages (1 hour)
- Homepage (`/`)
- Map page (`/map`)
- Other HTML pages

### No Cache
- Authentication endpoints (`/api/v1/auth/*`)
- Payment endpoints (`/api/v1/payment/*`)
- User endpoints (`/api/v1/user/*`)

## 🌍 Geo-Routing

The worker automatically routes requests to the nearest origin:

| Region | Countries | Origin |
|--------|-----------|--------|
| Asia | TH, SG, MY, ID, VN, PH, JP, KR, CN, TW, HK | `asia.api.vibecity.live` |
| Europe | GB, DE, FR, IT, ES, NL, SE, NO, DK, FI | `eu.api.vibecity.live` |
| US | US, CA, MX | `us.api.vibecity.live` |
| Default | All others | `api.vibecity.live` |

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy and Purge CDN

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        run: vercel deploy --prod
        
      - name: Purge CDN Cache
        run: |
          python infrastructure/cdn/cache-purge-webhook.py purge \
            --worker-url ${{ secrets.WORKER_URL }} \
            --secret ${{ secrets.CACHE_PURGE_SECRET }} \
            --type static
            
      - name: Warm Critical Pages
        run: |
          python infrastructure/cdn/cache-purge-webhook.py warm \
            --worker-url ${{ secrets.WORKER_URL }} \
            --secret ${{ secrets.CACHE_WARM_SECRET }} \
            --type critical
```

## 📈 Monitoring

### Cache Headers

The worker adds custom headers to responses:

- `X-Cache-Status`: `HIT`, `MISS`, or `BYPASS`
- `X-Cache-Age`: Age of cached content in seconds
- `X-Cache-TTL`: TTL configured for the content

### Example Response Headers

```
HTTP/2 200 OK
cache-control: public, max-age=31536000
x-cache-status: HIT
x-cache-age: 3600
x-cache-ttl: 31536000
content-type: application/javascript
```

### Cloudflare Analytics

Monitor CDN performance in Cloudflare dashboard:

1. Go to **Analytics & Logs** → **Workers**
2. View metrics:
   - Requests per second
   - CPU time
   - Errors
   - Cache hit rate

## 🐛 Troubleshooting

### Cache Not Working

1. **Check cache headers**
   ```bash
   curl -I https://vibecity.live/assets/main.js
   ```
   Look for `X-Cache-Status` header

2. **Verify worker is deployed**
   ```bash
   wrangler deployments list
   ```

3. **Check routes are configured**
   - Go to Cloudflare dashboard
   - Verify routes are active

### Low Cache Hit Rate

1. **Check cache policies**
   - Review `cache-policies.yaml`
   - Ensure TTLs are appropriate

2. **Verify origin headers**
   - Origin should not send `Cache-Control: no-cache`
   - Check for `Vary` headers

3. **Monitor cache age**
   - Check `X-Cache-Age` header
   - Ensure cache is not expiring too quickly

### Geo-Routing Not Working

1. **Check origin configuration**
   - Verify all origin URLs are accessible
   - Test each origin directly

2. **Check country detection**
   - Worker uses `request.cf.country`
   - Test from different regions

## 🎯 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Cache Hit Rate | >80% | TBD |
| API Latency (p95) | <200ms | TBD |
| TTFB | <100ms | TBD |
| Static Asset Load | <50ms | TBD |

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cache API Documentation](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare Analytics](https://developers.cloudflare.com/analytics/)

## 🔐 Security Considerations

1. **Secrets Management**
   - Never commit secrets to git
   - Use Wrangler secrets for sensitive data
   - Rotate secrets regularly

2. **Cache Poisoning Prevention**
   - Validate all cache keys
   - Sanitize user inputs
   - Use secure cache key generation

3. **DDoS Protection**
   - Cloudflare provides automatic DDoS protection
   - Configure rate limiting if needed
   - Monitor for unusual traffic patterns

## 📝 Next Steps

After deploying the CDN:

1. **Monitor Performance**
   - Set up Cloudflare Analytics
   - Track cache hit rates
   - Monitor response times

2. **Optimize Cache Policies**
   - Adjust TTLs based on usage patterns
   - Fine-tune cache invalidation
   - Optimize cache warming

3. **Scale Globally**
   - Add more regional origins
   - Optimize geo-routing rules
   - Test from all target regions

4. **Integrate with CI/CD**
   - Automate cache purging on deployments
   - Warm cache after deployments
   - Monitor deployment impact

## 🤝 Support

For issues or questions:
- Check troubleshooting section above
- Review Cloudflare Workers documentation
- Contact DevOps team

---

**Last Updated:** 2024-01-16
**Version:** 1.0.0
**Maintainer:** DevOps Team
