# CDN Deployment Runbook

## 🎯 Purpose
This runbook provides step-by-step procedures for deploying and managing the Multi-Region CDN infrastructure.

## 📋 Pre-Deployment Checklist

### Prerequisites
- [ ] Cloudflare account with Workers enabled
- [ ] Account ID obtained from Cloudflare dashboard
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Authenticated with Cloudflare (`wrangler login`)
- [ ] Origin servers configured and accessible
- [ ] DNS configured to point to Cloudflare

### Configuration Files
- [ ] `wrangler.toml` updated with correct Account ID
- [ ] Origin URLs configured in `wrangler.toml`
- [ ] Cache policies reviewed in `cache-policies.yaml`
- [ ] Secrets generated (CACHE_PURGE_SECRET, CACHE_WARM_SECRET)

## 🚀 Deployment Procedures

### Initial Deployment (Staging)

**Step 1: Verify Configuration**
```bash
cd infrastructure/cdn
cat wrangler.toml | grep account_id
```

**Step 2: Deploy Worker**
```bash
./deploy.sh --env staging
```

**Step 3: Verify Deployment**
```bash
wrangler deployments list --env staging
```

**Step 4: Test Worker**
```bash
curl -I https://your-worker-staging.workers.dev
```


### Production Deployment

**Step 1: Review Staging Performance**
```bash
python test-cdn-performance.py \
  --url https://staging-worker.workers.dev \
  --iterations 10
```

**Step 2: Deploy to Production**
```bash
./deploy.sh --env production
```

**Step 3: Configure Routes**
1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages → Your Worker
3. Click Triggers → Add Route
4. Add routes:
   - `vibecity.live/*`
   - `www.vibecity.live/*`

**Step 4: Verify Production**
```bash
curl -I https://vibecity.live
# Check for X-Cache-Status header
```

**Step 5: Warm Cache**
```bash
python cache-purge-webhook.py warm \
  --worker-url https://vibecity.live \
  --secret $CACHE_WARM_SECRET \
  --type critical
```

## 🔄 Operational Procedures

### Cache Purge After Deployment

**When:** After every production deployment
**Why:** Ensure users get latest assets

```bash
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


### Emergency Cache Purge

**When:** Critical bug in cached content
**Priority:** P0

```bash
# Purge everything immediately
python cache-purge-webhook.py purge \
  --worker-url https://vibecity.live \
  --secret $CACHE_PURGE_SECRET \
  --type all
```

### Scheduled Cache Warming

**When:** Every 6 hours (automated)
**Setup:** Configure in CI/CD or cron

```bash
# Add to crontab
0 */6 * * * cd /path/to/infrastructure/cdn && \
  python cache-purge-webhook.py warm \
  --worker-url https://vibecity.live \
  --secret $CACHE_WARM_SECRET \
  --type critical
```

## 🔍 Monitoring & Alerts

### Daily Health Checks

**Check 1: Cache Hit Rate**
```bash
# Should be >80%
# Check in Cloudflare Analytics dashboard
```

**Check 2: Response Times**
```bash
python test-cdn-performance.py \
  --url https://vibecity.live \
  --iterations 5
# Mean response time should be <200ms
```

**Check 3: Error Rate**
```bash
# Check Cloudflare Analytics
# Error rate should be <0.1%
```

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Cache Hit Rate | <70% | <60% | Review cache policies |
| Response Time (p95) | >300ms | >500ms | Check origin health |
| Error Rate | >1% | >5% | Investigate immediately |
| Worker CPU Time | >30ms | >45ms | Optimize worker code |


## 🐛 Troubleshooting Guide

### Issue: Low Cache Hit Rate

**Symptoms:**
- Cache hit rate <70%
- High origin traffic

**Diagnosis:**
```bash
# Check cache headers
curl -I https://vibecity.live/assets/main.js | grep -i cache

# Test cache effectiveness
python test-cdn-performance.py \
  --url https://vibecity.live \
  --cache-test
```

**Resolution:**
1. Review cache policies in `cache-policies.yaml`
2. Check origin `Cache-Control` headers
3. Verify TTL settings are appropriate
4. Redeploy worker if policies changed

### Issue: High Response Times

**Symptoms:**
- Response time >300ms
- User complaints about slow loading

**Diagnosis:**
```bash
# Test from multiple regions
python test-cdn-performance.py \
  --url https://vibecity.live \
  --location asia

# Check origin health
curl -w "@curl-format.txt" -o /dev/null -s https://api.vibecity.live
```

**Resolution:**
1. Check origin server health
2. Verify geo-routing is working
3. Review database query performance
4. Scale origin servers if needed

### Issue: Cache Not Updating

**Symptoms:**
- Old content still served after deployment
- Cache purge not working

**Diagnosis:**
```bash
# Check cache age
curl -I https://vibecity.live/assets/main.js | grep X-Cache-Age

# Verify purge webhook
python cache-purge-webhook.py purge \
  --worker-url https://vibecity.live \
  --secret $CACHE_PURGE_SECRET \
  --type all
```

**Resolution:**
1. Verify purge secret is correct
2. Check worker logs in Cloudflare dashboard
3. Manually purge via Cloudflare dashboard
4. Verify routes are configured correctly


## 🔄 Rollback Procedures

### Rollback Worker Deployment

**When:** Critical issue with new worker version

```bash
# List recent deployments
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production --deployment-id <DEPLOYMENT_ID>

# Verify rollback
curl -I https://vibecity.live
```

### Disable Worker (Emergency)

**When:** Worker causing critical issues

```bash
# Option 1: Remove routes (recommended)
# Go to Cloudflare Dashboard → Workers → Triggers
# Remove all routes temporarily

# Option 2: Deploy bypass worker
wrangler deploy --env production --name vibecity-cdn-worker-bypass
```

## 📊 Performance Benchmarks

### Baseline Metrics (Pre-CDN)
- Response Time (p95): 500ms
- Cache Hit Rate: 0%
- TTFB: 300ms

### Target Metrics (Post-CDN)
- Response Time (p95): <200ms
- Cache Hit Rate: >80%
- TTFB: <100ms

### Measurement Commands
```bash
# Full performance test
python test-cdn-performance.py \
  --url https://vibecity.live \
  --test-urls "/" "/map" "/api/v1/shops" \
  --iterations 20

# Cache effectiveness
python test-cdn-performance.py \
  --url https://vibecity.live \
  --cache-test \
  --iterations 10
```

## 🔐 Security Procedures

### Rotate Secrets

**When:** Every 90 days or after security incident

```bash
# Generate new secrets
NEW_PURGE_SECRET=$(openssl rand -hex 32)
NEW_WARM_SECRET=$(openssl rand -hex 32)

# Update secrets
echo $NEW_PURGE_SECRET | wrangler secret put CACHE_PURGE_SECRET --env production
echo $NEW_WARM_SECRET | wrangler secret put CACHE_WARM_SECRET --env production

# Update CI/CD secrets
# Update GitHub Actions secrets or equivalent
```

### Audit Access

**When:** Monthly

1. Review Cloudflare account access
2. Check worker deployment history
3. Review secret access logs
4. Verify route configurations

## 📞 Escalation Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| P0 - Critical | DevOps Lead | 15 minutes |
| P1 - High | DevOps Team | 1 hour |
| P2 - Medium | DevOps Team | 4 hours |
| P3 - Low | DevOps Team | Next business day |

---

**Last Updated:** 2024-01-16
**Version:** 1.0.0
**Owner:** DevOps Team
