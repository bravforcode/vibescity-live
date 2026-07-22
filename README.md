# VibeCity 🏙️

> Thai restaurant discovery & review platform — Map-first, mobile-optimized, real-time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3.6 + Rsbuild + Pinia + Tailwind CSS |
| Backend | FastAPI (Python 3.12) + Uvicorn |
| Database | Supabase (PostgreSQL + PostGIS) |
| Auth | Supabase Auth + RLS policies |
| Storage | Supabase Storage |
| Payments | Stripe (checkout + webhooks) |
| Maps | MapLibre GL + OpenStreetMap |
| CI/CD | GitHub Actions + Fly.io + Vercel |
| Monitoring | OpenTelemetry + Prometheus + Sentry |

## Project Structure

```
├── src/                    # Frontend (Vue 3)
│   ├── components/         # 98 Vue components
│   ├── composables/        # 86 composables (hooks)
│   ├── store/              # 10 Pinia stores
│   ├── services/           # 27 API services
│   ├── views/              # 40+ page views
│   └── utils/              # Utility functions
├── backend/                # Backend (FastAPI)
│   ├── app/
│   │   ├── api/routers/    # 24 API routers
│   │   ├── services/       # 21 business logic services
│   │   ├── core/           # 18 core modules
│   │   └── middleware/     # Security middleware
│   ├── migrations/         # 99 database migrations
│   └── tests/              # Backend tests
├── tests/                  # Frontend tests (Vitest)
│   └── unit/
│       ├── composables/    # Composable tests
│       ├── services/       # Service tests
│       ├── stores/         # Store tests
│       └── components/     # Component tests
└── .github/workflows/      # 23 CI/CD workflows
```

## Quick Start

```bash
# Frontend
bun install
bun dev

# Backend
cd backend
uv pip install -r requirements.txt
python run_backend.py
```

## Testing

```bash
# Run all tests
bun run test:unit

# Run with coverage
bun run test:unit:coverage

# Run specific test file
bun vitest run tests/unit/composables/useCurrency.spec.js
```

### Coverage Thresholds

| Module | Statements | Functions |
|--------|-----------|-----------|
| `src/store/**` | 25% | 24% |
| `src/utils/**` | 14% | 13% |
| `src/services/**` | 5% | 4% |
| `src/composables/**` | 1% | 1% |

## CI/CD Pipeline

The CI pipeline runs on every PR and push to main:

1. **Repo Hygiene** — Check for forbidden files
2. **Security Scan** — Bandit + Semgrep + Gitleaks
3. **Frontend** — Lint + Format + Test + Build
4. **Backend** — Tests + Coverage
5. **E2E Smoke** — Playwright tests
6. **SonarCloud** — Code quality + Coverage upload

## Deployment

- **Frontend**: Vercel (auto-deploy from main)
- **Backend**: Fly.io (sin region, 3 processes)
- **Database**: Supabase (managed PostgreSQL)

## Environment Variables

See `.env.example` for required environment variables.

## WSL (Windows) Note

If using WSL, install deps with:
```bash
bun install --os linux --cpu x64
```

## Enterprise Deployment

See `FLY_DEPLOYMENT_GUIDE.md` for production deployment instructions.
