# CDN Setup Guide

Complete step-by-step guide to set up the Multi-Region CDN infrastructure.

## 📋 Prerequisites

### 1. Cloudflare Account Setup

1. **Create Cloudflare Account**
   - Go to https://cloudflare.com
   - Sign up for a free account
   - Upgrade to Workers Paid plan ($5/month) for production use

2. **Add Your Domain**
   - Add `vibecity.live` to Cloudflare
   - Update nameservers at your domain registrar
   - Wait for DNS propagation (usually 24-48 hours)

3. **Get Account ID**
   - Go to Cloudflare Dashboard
   - Click on Workers & Pages
   - Copy your Account ID from the right sidebar

4. **Create API Token**
   - Go to My Profile → API Tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Save the token securely

### 2. Local Development Setup

**Install Node.js**
```bash
# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org
```

**Install Wrangler CLI**
```bash
npm install -g wrangler
```

**Install Python 3.11+**
```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt-get install python3.11 python3-pip

# Windows
# Download from https://python.org
```

**Install Python Dependencies**
```bash
cd infrastructure/cdn
pip install -r requirements.txt
```


## 🔧 Configuration

### 1. Update wrangler.toml

Edit `infrastructure/cdn/wrangler.toml`:

```toml
# Replace with your Account ID
account_id = "your-account-id-here"

# Update origin URLs
[env.production.vars]
ORIGIN_PRIMARY = "https://api.vibecity.live"
ORIGIN_ASIA = "https://asia.api.vibecity.live"
ORIGIN_EU = "https://eu.api.vibecity.live"
ORIGIN_US = "https://us.api.vibecity.live"
```

### 2. Generate Secrets

```bash
# Generate random secrets
CACHE_PURGE_SECRET=$(openssl rand -hex 32)
CACHE_WARM_SECRET=$(openssl rand -hex 32)

# Save these securely (e.g., in password manager)
echo "CACHE_PURGE_SECRET=$CACHE_PURGE_SECRET"
echo "CACHE_WARM_SECRET=$CACHE_WARM_SECRET"
```

### 3. Authenticate Wrangler

```bash
wrangler login
# This will open a browser for authentication
```

## 🚀 Deployment

### Step 1: Deploy to Staging

```bash
cd infrastructure/cdn

# Deploy worker
wrangler deploy --env staging

# Set secrets
echo "$CACHE_PURGE_SECRET" | wrangler secret put CACHE_PURGE_SECRET --env staging
echo "$CACHE_WARM_SECRET" | wrangler secret put CACHE_WARM_SECRET --env staging
```

### Step 2: Test Staging

```bash
# Get worker URL from deployment output
WORKER_URL="https://vibecity-cdn-worker-staging.your-subdomain.workers.dev"

# Test basic request
curl -I $WORKER_URL

# Test performance
python test-cdn-performance.py --url $WORKER_URL --iterations 5
```

### Step 3: Deploy to Production

```bash
# Deploy worker
wrangler deploy --env production

# Set secrets
echo "$CACHE_PURGE_SECRET" | wrangler secret put CACHE_PURGE_SECRET --env production
echo "$CACHE_WARM_SECRET" | wrangler secret put CACHE_WARM_SECRET --env production
```

### Step 4: Configure Routes

1. Go to Cloudflare Dashboard
2. Navigate to **Workers & Pages**
3. Click on your worker
4. Go to **Triggers** tab
5. Click **Add Route**
6. Add the following routes:
   - Pattern: `vibecity.live/*`
   - Zone: `vibecity.live`
   - Click **Add Route**
7. Repeat for:
   - `www.vibecity.live/*`
   - `*.vibecity.live/*` (if using subdomains)


### Step 5: Verify Production

```bash
# Test main domain
curl -I https://vibecity.live

# Check cache headers
curl -I https://vibecity.live/assets/main.js | grep -i x-cache

# Run performance test
python test-cdn-performance.py \
  --url https://vibecity.live \
  --iterations 10

# Test cache effectiveness
python test-cdn-performance.py \
  --url https://vibecity.live \
  --cache-test \
  --iterations 5
```

### Step 6: Warm Cache

```bash
# Warm critical pages
python cache-purge-webhook.py warm \
  --worker-url https://vibecity.live \
  --secret $CACHE_WARM_SECRET \
  --type critical
```

## 🔄 CI/CD Integration

### GitHub Actions

1. **Add Secrets to GitHub**
   - Go to repository Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `CLOUDFLARE_ACCOUNT_ID`
     - `CLOUDFLARE_API_TOKEN`
     - `CACHE_PURGE_SECRET`
     - `CACHE_WARM_SECRET`

2. **Add Workflow File**
   ```bash
   cp infrastructure/cdn/github-actions-example.yml \
      .github/workflows/cdn-deploy.yml
   ```

3. **Test Workflow**
   - Push changes to main branch
   - Check Actions tab in GitHub
   - Verify deployment succeeds

## 📊 Monitoring Setup

### 1. Cloudflare Analytics

1. Go to Cloudflare Dashboard
2. Navigate to **Analytics & Logs** → **Workers**
3. View metrics:
   - Requests per second
   - CPU time
   - Errors
   - Success rate

### 2. Custom Monitoring

Set up scheduled performance tests:

```bash
# Add to crontab
crontab -e

# Add this line (runs every hour)
0 * * * * cd /path/to/infrastructure/cdn && \
  python test-cdn-performance.py \
  --url https://vibecity.live \
  --iterations 5 >> /var/log/cdn-performance.log 2>&1
```

## ✅ Post-Deployment Checklist

- [ ] Worker deployed to staging and production
- [ ] Routes configured in Cloudflare
- [ ] Secrets set for both environments
- [ ] Performance tests passing
- [ ] Cache hit rate >70%
- [ ] Response time <200ms (p95)
- [ ] CI/CD pipeline configured
- [ ] Monitoring set up
- [ ] Team trained on cache management
- [ ] Documentation reviewed

## 🎯 Success Criteria

Your CDN is successfully deployed when:

1. **Cache Hit Rate >80%**
   ```bash
   python test-cdn-performance.py --url https://vibecity.live --cache-test
   ```

2. **Response Time <200ms (p95)**
   ```bash
   python test-cdn-performance.py --url https://vibecity.live --iterations 20
   ```

3. **All Routes Working**
   ```bash
   curl -I https://vibecity.live | grep "x-cache-status"
   curl -I https://www.vibecity.live | grep "x-cache-status"
   ```

4. **Cache Management Working**
   ```bash
   # Test purge
   python cache-purge-webhook.py purge \
     --worker-url https://vibecity.live \
     --secret $CACHE_PURGE_SECRET \
     --type static
   
   # Test warm
   python cache-purge-webhook.py warm \
     --worker-url https://vibecity.live \
     --secret $CACHE_WARM_SECRET \
     --type critical
   ```

## 🆘 Getting Help

If you encounter issues:

1. Check the [Troubleshooting Guide](RUNBOOK.md#troubleshooting-guide)
2. Review [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
3. Check worker logs: `wrangler tail --env production`
4. Contact DevOps team

---

**Setup Time:** ~2 hours
**Difficulty:** Intermediate
**Last Updated:** 2024-01-16
