---
name: fullstack-scaffold
description: >
  Rapidly generates complete, production-ready project scaffolds for full stack applications.
  ALWAYS use this skill when the user asks to: "create a new project", "scaffold a starter",
  "set up a monorepo", "bootstrap an app", "initialize a project structure", "generate
  boilerplate", or "create a template for X". Also triggers for: setting up folder structure,
  creating project from scratch, "how should I structure my project", setting up a new
  microservice, or any request to initialize a codebase. Handles: Next.js, React, Vue, Node.js,
  FastAPI, Go, NestJS, monorepos (Turborepo/Nx), T3 stack, and microservice architectures.
  Delivers full file trees with actual code content, not just structure diagrams.
---

# Full Stack Scaffold Skill

## Core Deliverables
Always generate **actual file content** — not just a file tree. Every file should be functional, not a stub.

## Stack Detection
Identify from user request:
- **Frontend**: Next.js / React / Vue / Svelte / Astro
- **Backend**: Node/Express/NestJS / FastAPI / Go/Gin / Django / Rails
- **Database**: PostgreSQL / MySQL / MongoDB / SQLite
- **Auth**: NextAuth / Auth0 / Clerk / JWT custom / Supabase Auth
- **ORM**: Prisma / Drizzle / TypeORM / SQLAlchemy / GORM
- **Style**: Tailwind / CSS Modules / Styled Components / Shadcn
- **Monorepo**: Turborepo / Nx / pnpm workspaces

---

## Project Types & Templates

### Type 1: Next.js Full Stack (App Router + Prisma + Tailwind)
→ Read `references/nextjs-scaffold.md` for complete file contents

### Type 2: Node.js REST API (Express/NestJS + PostgreSQL)
→ Read `references/node-api-scaffold.md`

### Type 3: FastAPI + PostgreSQL (Python)
→ Read `references/fastapi-scaffold.md`

### Type 4: Turborepo Monorepo
→ Read `references/monorepo-scaffold.md`

### Type 5: Go + Gin REST API
→ Read `references/go-scaffold.md`

---

## Universal File Set (ALL projects)

Every scaffold must include these files:

### .env.example
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Auth
JWT_SECRET=change-me-in-production
NEXTAUTH_SECRET=change-me-in-production
NEXTAUTH_URL=http://localhost:3000

# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# External Services
# REDIS_URL=redis://localhost:6379
# SMTP_HOST=smtp.example.com
```

### .gitignore (comprehensive)
```gitignore
# Dependencies
node_modules/
.venv/
vendor/

# Build
dist/
build/
.next/
out/
__pycache__/
*.pyc
target/

# Environment
.env
.env.local
.env.*.local
!.env.example

# IDE
.idea/
.vscode/
*.swp
.DS_Store

# Logs
*.log
logs/
npm-debug.log*

# Test
coverage/
.nyc_output/
htmlcov/

# Misc
.turbo/
.cache/
```

### package.json scripts pattern
```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "start": "...",
    "test": "...",
    "test:watch": "...",
    "test:coverage": "...",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "db:migrate": "...",
    "db:seed": "...",
    "db:studio": "..."
  }
}
```

---

## Architecture Patterns

### Folder Structure (Backend — Clean Architecture)
```
src/
├── api/              # Route handlers / controllers
│   └── v1/
├── services/         # Business logic
├── repositories/     # Data access layer
├── models/           # Domain models / schemas
├── middleware/       # Auth, logging, error handling
├── utils/            # Pure helper functions
├── config/           # Config loading (env vars)
├── types/            # TypeScript types/interfaces
└── main.ts           # Entry point
```

### Folder Structure (Next.js App Router)
```
app/
├── (auth)/           # Route groups
│   ├── login/
│   └── register/
├── (dashboard)/
│   ├── layout.tsx
│   └── page.tsx
├── api/              # API routes
│   └── [...route]/
├── globals.css
└── layout.tsx

components/
├── ui/               # Shadcn/primitives
├── forms/
└── layouts/

lib/
├── db.ts             # DB client singleton
├── auth.ts           # Auth config
└── utils.ts

hooks/                # Custom React hooks
types/                # TypeScript types
```

---

## Config Files to Always Generate

### ESLint + Prettier
```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "prettier",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### TypeScript (strict)
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Vitest / Jest config
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: { lines: 80, functions: 80 }
    },
    setupFiles: ['./tests/setup.ts']
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
})
```

---

## Output Instructions
1. Show the full file tree first with descriptions
2. Output every file's full content (never use `// ... rest of code`)
3. Add comments on non-obvious architectural choices
4. Include a README.md with setup instructions
5. Mention which commands to run first (install → env setup → DB migrate → dev)
