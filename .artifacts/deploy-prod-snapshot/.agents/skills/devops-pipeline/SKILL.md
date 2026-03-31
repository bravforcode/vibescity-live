---
name: devops-pipeline
description: >
  Expert-level DevOps skill for generating production-ready Docker configs, CI/CD pipelines,
  Kubernetes manifests, and container orchestration workflows. ALWAYS use this skill when the
  user mentions: Dockerfile, docker-compose, GitHub Actions, GitLab CI, CI/CD, pipeline,
  Kubernetes, k8s, Helm chart, container, deployment manifest, .github/workflows, build pipeline,
  release automation, ArgoCD, or anything related to shipping code to production. Also triggers
  for: "how do I deploy X", "set up CI for Y", "containerize my app", "write a pipeline for Z",
  "multi-stage Docker build", or "automate my deployment". Delivers battle-tested configs with
  security best practices, caching optimizations, and environment-aware setups (dev/staging/prod).
---

# DevOps Pipeline Skill

## Core Philosophy
- **Speed first**: Maximize cache hits, parallelize jobs, minimize cold starts
- **Security baked in**: Non-root containers, secret scanning, SAST in pipeline
- **DRY configs**: Reusable workflows, templated stages, matrix builds
- **12-Factor ready**: Env-var driven, stateless containers, explicit deps

---

## Workflow: What to deliver

### 1. Understand the stack first
Ask or infer:
- Language/runtime (Node, Python, Go, Java, etc.)
- Package manager (npm/pnpm/yarn, pip/poetry, go mod, maven/gradle)
- CI platform: GitHub Actions / GitLab CI / CircleCI / Jenkins / Bitbucket
- Target: Docker Hub / ECR / GCR / GHCR
- Deploy target: k8s / ECS / Cloud Run / App Engine / bare VPS
- Monorepo or single-service?

### 2. Generate output package
Always produce a **complete, copy-paste-ready** set:
- `Dockerfile` (multi-stage)
- `docker-compose.yml` (local dev + services)
- CI/CD pipeline file
- `.dockerignore`
- Deployment manifest (if k8s)

---

## Docker: Multi-Stage Best Practices

```dockerfile
# ── EXAMPLE: Node.js multi-stage ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

**Always include:**
- `HEALTHCHECK` instruction
- Non-root user (`adduser`/`useradd`)
- `npm ci` not `npm install`
- `.dockerignore` with: `node_modules`, `.git`, `*.log`, `coverage/`, `.env*`

### Language-specific patterns:
→ Read `references/docker-patterns.md` for Go, Python, Java, Rust specifics

---

## GitHub Actions: Production Template

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'                          # ← cache layer
      - run: npm ci
      - run: npm run lint
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v4        # ← coverage report

  build-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3    # ← BuildKit
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=sha-
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha              # ← GitHub cache
          cache-to: type=gha,mode=max

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      # Add deploy step based on target platform
```

### Pipeline patterns by platform:
→ Read `references/ci-patterns.md` for GitLab CI, CircleCI, Jenkins

---

## Kubernetes Manifests

When deploying to k8s, always generate:
1. `deployment.yaml` — with resource limits, liveness/readiness probes
2. `service.yaml` — ClusterIP or LoadBalancer
3. `ingress.yaml` — with TLS annotation
4. `configmap.yaml` — non-secret config
5. `hpa.yaml` — Horizontal Pod Autoscaler

**Critical k8s defaults to always include:**
```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
```

→ Read `references/k8s-patterns.md` for Helm, ArgoCD, namespace strategies

---

## docker-compose: Local Dev

Always include dev-friendly features:
```yaml
services:
  app:
    build:
      context: .
      target: builder          # ← use builder stage for hot reload
    volumes:
      - .:/app
      - /app/node_modules      # ← named volume to avoid overwrite
    environment:
      - NODE_ENV=development
    env_file: .env.local
    depends_on:
      db:
        condition: service_healthy   # ← wait for healthy DB
    ports:
      - "3000:3000"

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## Security Checklist (always verify)
- [ ] No secrets hardcoded — use `${{ secrets.X }}` or env files
- [ ] Image scanning: add `aquasecurity/trivy-action` to pipeline
- [ ] Non-root container user
- [ ] Read-only root filesystem where possible (`readOnlyRootFilesystem: true`)
- [ ] Pinned action versions (`@v4` not `@latest`)
- [ ] GITHUB_TOKEN minimum permissions declared

---

## Output Format
Always deliver as a **file tree** then **each file's full content** in code blocks:

```
project/
├── Dockerfile
├── .dockerignore
├── docker-compose.yml
├── docker-compose.override.yml   (dev overrides)
└── .github/
    └── workflows/
        └── ci-cd.yml
```

Then full content of each file. Never truncate. Always add inline comments explaining non-obvious choices.
