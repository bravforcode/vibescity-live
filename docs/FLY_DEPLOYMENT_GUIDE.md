# 🚀 Fly.io Deployment Guide for VibeCity API

This guide outlines the steps to deploy the VibeCity FastAPI backend to Fly.io.

---

## 📋 Prerequisites

1. **Fly.io CLI (`flyctl`)**: Install it from [fly.io/docs/hands-on/install-flyctl/](https://fly.io/docs/hands-on/install-flyctl/)
2. **Fly.io Account**: Sign up at [fly.io](https://fly.io/)

---

## 🛠️ Step-by-Step Deployment

### 1. Login to Fly.io
Open your terminal and run:
```bash
fly auth login
```

### 2. Create the Fly App (First Time Only)
Run this command to create the app placeholder:
```bash
fly apps create vibecity-api
```

### 3. Set Environment Secrets (Critical)
The API needs Supabase, Redis, and Stripe credentials to function. **Note**: If you see "smoke checks failed" during this step, it's okay—it just means the *old* broken code couldn't restart. We will fix it in the next step.

```bash
# Set ALL required secrets
fly secrets set \
  ENV="production" \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_KEY="your-anon-key" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  REDIS_URL="your-upstash-redis-url" \
  STRIPE_SECRET_KEY="sk_test_..." # You can use your Test Key (sk_test_) for now
```

> [!TIP]
> **Stripe Live Keys**: To get production keys, you need to toggle off "Test mode" in your [Stripe Dashboard](https://dashboard.stripe.com/). For now, using `sk_test_` is perfectly fine for testing the deployment.
> You can check your current secrets with `fly secrets list`.

### 4. Deploy the App (Sync Fixed Code)
Run the deployment command from the root directory of the project. **This step will build a new image with the code fixes I applied.**

```bash
fly deploy --remote-only
```
- `--remote-only`: Builds the Docker image on Fly.io's servers.
- **Why was it still failing?**: Fly.io was trying to restart an old, broken image. This command builds a fresh one.

### 5. Verify Deployment
Once completed, verify the app status and logs:

```bash
# Check status
fly status

# View live logs
fly logs
```

---

## 🏥 Health Check
The API includes a health check endpoint. Once deployed, verify it at:
`https://vibecity-api.fly.dev/api/v1/health`

---

## 🔄 Updating the Backend
Whenever you make changes to the `backend/` folder or `requirements.txt`, simply run:
```bash
fly deploy
```

---

## ⚠️ Troubleshooting

- **Redis Connection Issues**: Ensure the `REDIS_URL` secret is correct and the Redis instance is accessible.
- **Supabase Errors**: Verify the `SUPABASE_URL` and keys match the environment (Staging vs Prod).
- **Process Failures**: Use `fly logs` to see why the `api`, `clock`, or `ocr` processes might be failing.
