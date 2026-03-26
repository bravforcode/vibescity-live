---
name: security-hardening
description: >
  Expert application and infrastructure security skill covering OWASP Top 10, dependency
  scanning, secrets management, input validation, CORS/CSP headers, SQL injection prevention,
  authentication hardening, and security CI/CD integration. ALWAYS use this skill when the
  user asks about: security, OWASP, vulnerabilities, XSS, SQL injection, CSRF, authentication
  security, JWT security, secrets management, API security, dependency vulnerabilities, security
  headers, penetration testing, or "how to secure X". Also triggers for: "is this secure",
  "security review", "harden my app", "add security headers", "scan for vulnerabilities",
  "secure my JWT", "prevent XSS/CSRF/SQLi", "secrets in code", or any security audit request.
  Delivers actionable code fixes, security configs, and CI pipeline security integrations.
  Never gives vague advice — always provides concrete, copy-paste-ready implementations.
---

# Security Hardening Skill

## OWASP Top 10 Quick Reference (2021)

| # | Risk | Key Fix |
|---|------|---------|
| A01 | Broken Access Control | AuthZ checks on every endpoint; deny by default |
| A02 | Cryptographic Failures | TLS everywhere, encrypt sensitive data at rest |
| A03 | Injection | Parameterized queries, input validation, ORM |
| A04 | Insecure Design | Threat modeling, fail securely |
| A05 | Security Misconfiguration | Security headers, disable debug in prod |
| A06 | Vulnerable Components | Automated dependency scanning in CI |
| A07 | Auth & Session Failures | MFA, rate limiting, secure session management |
| A08 | Software/Data Integrity | Sign artifacts, verify checksums |
| A09 | Logging Failures | Log security events, no sensitive data in logs |
| A10 | SSRF | Validate/allowlist outbound URLs |

---

## Security Headers (Express)

```typescript
import helmet from 'helmet'
import cors from 'cors'

// Helmet sets all critical security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-{NONCE}'"],   // or use hash
      styleSrc: ["'self'", "'unsafe-inline'"],      // tighten if possible
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.API_URL!],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,      // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}))

// CORS — whitelist only known origins
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',')
    if (!origin || allowed.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: ${origin} not allowed`))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400,   // preflight cache 24h
}))
```

---

## Input Validation (Zod — always validate at boundary)

```typescript
import { z } from 'zod'

// Never trust user input — validate schema at API boundary
export const createUserSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  name: z.string().min(2).max(100).trim()
    .regex(/^[\w\s\-'.]+$/, 'Invalid characters in name'),
  role: z.enum(['user', 'admin']).default('user'),
})

// Validation middleware factory
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      })
    }
    req.body = result.data   // use parsed/sanitized data
    next()
  }
}

// Usage
router.post('/users', validate(createUserSchema), createUser)
```

---

## SQL Injection Prevention

```typescript
// ✅ ALWAYS use parameterized queries
// Prisma (safe by default)
const user = await prisma.user.findUnique({ where: { email } })

// Raw SQL with parameters — never string interpolation
const users = await prisma.$queryRaw`
  SELECT * FROM users 
  WHERE email = ${email} 
  AND created_at > ${startDate}
`

// pg (node-postgres)
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1 AND status = $2',
  [email, status]    // ← parameters, never template literal
)

// ❌ NEVER do this
const result = await pool.query(`SELECT * FROM users WHERE email = '${email}'`)
```

---

## JWT Security

```typescript
import jwt from 'jsonwebtoken'
import { createHash, randomBytes } from 'crypto'

// JWT best practices
const JWT_CONFIG = {
  algorithm: 'HS256' as const,
  expiresIn: '15m',          // short-lived access tokens
  issuer: 'myapp',
  audience: 'myapp-api',
}

export function signToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, JWT_CONFIG)
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    })
  } catch {
    return null
  }
}

// Refresh token pattern — store hash in DB, not raw token
export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')
  
  await prisma.refreshToken.create({
    data: {
      hash,
      userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  })
  
  return token  // return raw, store only hash
}

export async function rotateRefreshToken(oldToken: string): Promise<string | null> {
  const hash = createHash('sha256').update(oldToken).digest('hex')
  const stored = await prisma.refreshToken.findUnique({ where: { hash } })
  
  if (!stored || stored.expiresAt < new Date() || stored.revokedAt) {
    // Reuse detection — revoke all tokens for this user
    if (stored) await prisma.refreshToken.updateMany({
      where: { userId: stored.userId },
      data: { revokedAt: new Date() },
    })
    return null
  }
  
  // Delete old, issue new
  await prisma.refreshToken.delete({ where: { hash } })
  return createRefreshToken(stored.userId)
}
```

---

## Password Hashing

```typescript
import bcrypt from 'bcryptjs'
import { scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

// bcrypt (simpler, most common)
const BCRYPT_ROUNDS = 12   // minimum 12 in production

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)  // timing-safe by default
}

// For timing-safe string comparison (e.g., API keys)
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA)  // prevent length-based timing
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
```

---

## Secrets Management

```typescript
// ✅ Never hardcode secrets — load from environment
// For local dev: .env file (gitignored)
// For production: AWS Secrets Manager / HashiCorp Vault / GCP Secret Manager

// AWS Secrets Manager helper
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({ region: 'ap-southeast-1' })
const secretCache = new Map<string, { value: string; expiresAt: number }>()

export async function getSecret(secretName: string): Promise<string> {
  const cached = secretCache.get(secretName)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  )
  const value = response.SecretString!
  secretCache.set(secretName, { value, expiresAt: Date.now() + 5 * 60 * 1000 }) // 5min cache
  return value
}

// Use at startup, not per-request
export async function loadSecrets() {
  process.env.DATABASE_PASSWORD = await getSecret('myapp/db-password')
  process.env.STRIPE_SECRET_KEY = await getSecret('myapp/stripe-key')
}
```

**Secrets in Docker/k8s:**
```yaml
# k8s Secret (encrypted at rest in etcd)
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
type: Opaque
stringData:           # base64 encoded automatically
  DATABASE_URL: "postgresql://..."
  JWT_SECRET: "..."

# Reference in pod
envFrom:
  - secretRef:
      name: myapp-secrets
```

---

## Security CI/CD Pipeline

```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request, schedule: [{cron: '0 2 * * 1'}]]  # weekly

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high    # fail on high+ severity

  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # full history for scanning
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: false
          tags: myapp:scan
          load: true
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:scan
          severity: CRITICAL,HIGH
          exit-code: '1'

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: typescript
      - uses: github/codeql-action/analyze@v3
```

---

## Security Audit Checklist

### Authentication
- [ ] Passwords hashed with bcrypt (rounds ≥ 12) or Argon2
- [ ] JWT tokens short-lived (≤ 15min access, ≤ 30d refresh)
- [ ] Refresh token rotation with reuse detection
- [ ] Rate limit login endpoint (5 attempts / 15 min)
- [ ] Account lockout after repeated failures
- [ ] MFA available for sensitive accounts

### Authorization
- [ ] Every protected endpoint checks auth
- [ ] RBAC enforced server-side (never trust client)
- [ ] Resource ownership verified (user can only access own data)
- [ ] Admin routes on separate path with stricter checks

### Data
- [ ] All user input validated with schema (Zod/Joi)
- [ ] Parameterized queries everywhere (no string interpolation in SQL)
- [ ] Sensitive fields (passwords, tokens) never returned in API responses
- [ ] PII encrypted at rest in database
- [ ] No secrets in code, logs, or error messages

### Infrastructure
- [ ] HTTPS only, HSTS enabled
- [ ] Security headers set (Helmet)
- [ ] CORS whitelist (not `*`)
- [ ] Dependency vulnerabilities scanned in CI
- [ ] Container image scanned for CVEs
- [ ] Secrets in vault/secret manager, not env files
- [ ] Least-privilege IAM roles
