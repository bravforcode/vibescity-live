---
name: database-ops
description: >
  Expert database skill covering schema design, migrations, query optimization, indexing
  strategies, and ORM usage. ALWAYS use this skill when the user asks about: database schema
  design, SQL queries, migrations, Prisma/Drizzle/TypeORM/SQLAlchemy models, PostgreSQL/MySQL
  optimization, query performance, indexes, database normalization, ERD design, connection
  pooling, transactions, or anything involving data modeling. Also triggers for: "design the
  database for X", "write a migration for Y", "optimize this slow query", "which indexes should
  I add", "how to handle many-to-many", "Prisma schema for Z", "write SQL for W", "explain query
  plan", or "database best practices". Handles PostgreSQL, MySQL, SQLite, MongoDB. Delivers
  production-ready schemas, migration files, and optimized queries with explanations.
---

# Database Ops Skill

## Core Principles
- **Schema stability**: Get it right early — migrations are painful to undo
- **Index everything you filter/sort by** — but not blindly (indexes cost write speed)
- **N+1 is the enemy** — always eager-load related data
- **Transactions for multi-step writes** — never leave data in inconsistent state
- **Connection pooling is mandatory** — never open raw connections in request handlers

---

## Schema Design Checklist

Every table/model must have:
```sql
id          -- prefer CUID/UUID over auto-increment for distributed systems
created_at  -- TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  -- TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Naming Conventions
```sql
-- Tables: snake_case, plural
CREATE TABLE user_profiles (...);
CREATE TABLE order_items (...);

-- Foreign keys: {table_singular}_id
user_id, product_id, order_id

-- Indexes: idx_{table}_{column(s)}
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- Unique constraints: uq_{table}_{column}
CONSTRAINT uq_users_email UNIQUE (email)
```

---

## PostgreSQL: Production Schema Template

```sql
-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- GIN indexes for composite

-- Updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT concat('usr_', replace(gen_random_uuid()::text, '-', '')),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  password    TEXT,          -- bcrypt hash, nullable for OAuth users
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_active ON users(role, is_active) WHERE is_active = TRUE;
```

---

## Prisma Schema Patterns

### One-to-Many
```prisma
model User {
  id    String  @id @default(cuid())
  posts Post[]
}

model Post {
  id       String @id @default(cuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Many-to-Many (explicit join table)
```prisma
model Post {
  id   String      @id @default(cuid())
  tags PostToTag[]
}

model Tag {
  id    String      @id @default(cuid())
  name  String      @unique
  posts PostToTag[]
}

model PostToTag {
  postId    String
  tagId     String
  post      Post   @relation(fields: [postId], references: [id])
  tag       Tag    @relation(fields: [tagId], references: [id])
  createdAt DateTime @default(now())

  @@id([postId, tagId])
  @@index([tagId])
}
```

### Soft Delete Pattern
```prisma
model Post {
  id        String    @id @default(cuid())
  deletedAt DateTime?

  @@index([deletedAt])  // fast filter for non-deleted
}
```
```typescript
// Middleware to auto-filter soft-deleted
prisma.$use(async (params, next) => {
  if (params.model === 'Post') {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, deletedAt: null }
    }
  }
  return next(params)
})
```

---

## Query Optimization

### Check slow queries (PostgreSQL)
```sql
-- Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = '100';  -- log queries > 100ms
SELECT pg_reload_conf();

-- Find slow queries
SELECT query, calls, total_time/calls AS avg_ms, rows
FROM pg_stat_statements
ORDER BY avg_ms DESC
LIMIT 20;

-- EXPLAIN ANALYZE for a specific query
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.*, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.is_active = TRUE
GROUP BY u.id
ORDER BY u.created_at DESC
LIMIT 20;
```

### Read the EXPLAIN output
```
Seq Scan       → 🔴 table scan, likely needs index
Index Scan     → 🟢 using index
Index Only Scan → 🟢🟢 best, no heap fetch needed
Hash Join      → 🟡 ok for large sets
Nested Loop    → 🟡 ok for small sets, bad for large
Bitmap Heap Scan → 🟡 medium, using index then fetching rows
```

### Index Strategies
```sql
-- Standard B-tree (most common)
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Partial index (smaller, faster for filtered queries)
CREATE INDEX idx_orders_pending ON orders(user_id, created_at)
WHERE status = 'pending';

-- Composite index — order matters! (leftmost prefix rule)
-- This covers: (user_id), (user_id, status), (user_id, status, created_at)
CREATE INDEX idx_orders_composite ON orders(user_id, status, created_at DESC);

-- Full-text search
CREATE INDEX idx_posts_title_fts ON posts USING GIN(to_tsvector('english', title));
-- Query:
SELECT * FROM posts WHERE to_tsvector('english', title) @@ plainto_tsquery('search term');

-- JSON/JSONB index
CREATE INDEX idx_metadata_key ON products USING GIN(metadata);
```

### N+1 Prevention (Prisma)
```typescript
// ❌ N+1: fetches users then 1 query per user for posts
const users = await prisma.user.findMany()
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { userId: user.id } })
}

// ✅ Eager load with include
const users = await prisma.user.findMany({
  include: {
    posts: {
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
    _count: { select: { posts: true } },  // count without loading
  },
})
```

---

## Migrations Best Practices

### Prisma Migrations
```bash
# Development
npx prisma migrate dev --name add_user_profile

# Production (applies pending, never resets)
npx prisma migrate deploy

# Check status
npx prisma migrate status

# Generate types after schema change
npx prisma generate
```

### Safe Migration Patterns
```sql
-- ✅ Adding nullable column (no downtime)
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- ✅ Adding column with default (Postgres 11+, no table rewrite)
ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- ⚠️ Adding NOT NULL without default (table rewrite = lock!)
-- Pattern: add nullable → backfill → add constraint
ALTER TABLE users ADD COLUMN phone TEXT;
UPDATE users SET phone = '' WHERE phone IS NULL;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- ✅ Add index CONCURRENTLY (no table lock)
CREATE INDEX CONCURRENTLY idx_users_phone ON users(phone);

-- ⚠️ Never drop column in same deploy as removing from code
-- Deploy 1: Remove code references
-- Deploy 2: Drop column
```

---

## Connection Pooling

```typescript
// Prisma — already pooled, use singleton
import { db } from '@/lib/db'  // see fullstack-scaffold for singleton pattern

// Raw PostgreSQL with pg pool
import { Pool } from 'pg'
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// For serverless (use PgBouncer or Prisma Accelerate)
// DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
```

---

## Transactions
```typescript
// Prisma transaction
const [user, post] = await prisma.$transaction([
  prisma.user.create({ data: userData }),
  prisma.post.create({ data: postData }),
])

// Interactive transaction (for conditional logic)
await prisma.$transaction(async (tx) => {
  const account = await tx.account.findUnique({ where: { id } })
  if (account.balance < amount) throw new Error('Insufficient funds')
  await tx.account.update({ where: { id }, data: { balance: { decrement: amount } } })
  await tx.transaction.create({ data: { accountId: id, amount, type: 'debit' } })
})
```
