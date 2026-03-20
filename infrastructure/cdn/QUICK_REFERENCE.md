# CDN Quick Reference Card

## 🚀 Common Commands

### Deployment
```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production

# Using deploy script
./deploy.sh --env production
```

### Cache Management
```bash
# Purge all cache
python cache-purge-webhook.py purge \
  --worker-url https://vibecity.live \
  --secret $CACHE_PURGE_SECRET \
  --type all

# Purge static assets
python cache-purge-webhook.py purge \
  --worker-url https://vibecity.live \
  --secret $CACHE_PURGE_SECRET \
  --type static

# Warm critical pages
python cache-purge-webhook.py warm \
  --worker-url https://vibecity.live \
  --secret $CACHE_WARM_SECRET \
  --type critical
```

### Testing
```bash
# Performance test
python test-cdn-performance.py \
  --url https://vibecity.live \
  --iterations 10

# Cache effectiveness test
python test-cdn-performance.py \
  --url https://vibecity.live \
  --cache-test
```

### Monitoring
```bash
# View worker logs
wrangler tail --env production

# List deployments
wrangler deployments list --env production

# Check cache headers
curl -I https://vibecity.live/assets/main.js | grep -i x-cache
```

## 📊 Cache TTLs

| Asset Type | TTL | Pattern |
|------------|-----|---------|
| Static Assets | 1 year | `*.js`, `*.css`, `*.woff2` |
| Images | 30 days | `*.jpg`, `*.png`, `*.webp` |
| API Responses | 5 minutes | `/api/v1/*` |
| HTML Pages | 1 hour | `*.html`, `/` |
| No Cache | 0 | `/api/v1/auth/*`, `/api/v1/payment/*` |

## 🌍 Geo-Routing

| Region | Origin |
|--------|--------|
| Asia | `asia.api.vibecity.live` |
| Europe | `eu.api.vibecity.live` |
| US | `us.api.vibecity.live` |
| Default | `api.vibecity.live` |

## 🎯 Performance Targets

- Cache Hit Rate: >80%
- Response Time (p95): <200ms
- TTFB: <100ms
- Error Rate: <0.1%

## 🔐 Secrets

```bash
# Set secrets
wrangler secret put CACHE_PURGE_SECRET --env production
wrangler secret put CACHE_WARM_SECRET --env production

# List secrets
wrangler secret list --env production
```

## 🐛 Quick Troubleshooting

**Low cache hit rate?**
```bash
# Check cache headers
curl -I https://vibecity.live/assets/main.js

# Test cache effectiveness
python test-cdn-performance.py --url https://vibecity.live --cache-test
```

**High response times?**
```bash
# Test performance
python test-cdn-performance.py --url https://vibecity.live

# Check origin health
curl -w "@curl-format.txt" https://api.vibecity.live
```

**Cache not updating?**
```bash
# Purge all cache
python cache-purge-webhook.py purge \
  --worker-url https://vibecity.live \
  --secret $CACHE_PURGE_SECRET \
  --type all
```

## 📞 Emergency Contacts

| Issue | Contact | Response Time |
|-------|---------|---------------|
| P0 - Critical | DevOps Lead | 15 minutes |
| P1 - High | DevOps Team | 1 hour |

## 📚 Documentation

- Setup: `SETUP.md`
- Operations: `RUNBOOK.md`
- Full Guide: `README.md`
