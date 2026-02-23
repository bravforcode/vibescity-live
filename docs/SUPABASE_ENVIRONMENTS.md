# Supabase Environment Setup

> **Status**: Production and Staging environments configured
> **Organization**: https://supabase.com/dashboard/org/jihlvvlhvghfpzwalekp

---

## Environment Configuration

### Production
- **Project ID**: `vibe-city-live`
- **Purpose**: Live user-facing application
- **Deploy**: Vercel (frontend) + Fly.io (backend)

### Staging
- **Project ID**: Separate staging project (from org dashboard)
- **Purpose**: Testing, QA, and pre-production validation
- **Deploy**: Preview deployments

---

## Environment Variable Mapping

| Variable | Production Source | Staging Source |
|----------|------------------|----------------|
| `SUPABASE_URL` | Production project URL | Staging project URL |
| `SUPABASE_ANON_KEY` | Production anon key | Staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service key | Staging service key |

---

## Migration Workflow

1. **Develop**: Create migration in `supabase/migrations/`
2. **Test**: Apply to staging: `supabase db push --linked-project=staging`
3. **Verify**: Test Edge Functions on staging
4. **Deploy**: Apply to production: `supabase db push --linked-project=production`

---

## Linking Projects

```bash
# Link staging for development
supabase link --project-ref <staging-project-id>

# Push migrations to staging
supabase db push

# Switch to production for deployment
supabase link --project-ref <production-project-id>
supabase db push
```

---

## Edge Function Deployment

```bash
# Deploy all functions to staging
supabase functions deploy --project-ref <staging-project-id>

# Deploy to production
supabase functions deploy --project-ref <production-project-id>
```

---

## Best Practices

1. **Never push directly to production** - Always test on staging first
2. **Use environment-specific secrets** via `supabase secrets set`
3. **Keep migrations idempotent** with `IF NOT EXISTS`/`IF EXISTS`
4. **Review RLS policies** before deploying to either environment
