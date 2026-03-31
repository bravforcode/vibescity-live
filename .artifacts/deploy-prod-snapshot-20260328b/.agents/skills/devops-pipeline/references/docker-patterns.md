# Docker Patterns by Language

## Go
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download                          # cache deps layer
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

FROM scratch                                  # minimal image ~5MB
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8080
ENTRYPOINT ["/server"]
```

## Python (FastAPI/Flask)
```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

FROM base AS deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runner
RUN adduser --disabled-password --gecos "" appuser
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY . .
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**With Poetry:**
```dockerfile
FROM python:3.12-slim
ENV POETRY_NO_INTERACTION=1 \
    POETRY_VENV_IN_PROJECT=1
RUN pip install poetry==1.8.0
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN poetry install --only=main --no-root
COPY . .
RUN poetry install --only=main
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0"]
```

## Java / Spring Boot
```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw dependency:go-offline -q   # cache deps
COPY src ./src
RUN ./mvnw package -DskipTests

# Layered JAR (Spring Boot 2.3+)
FROM eclipse-temurin:21-jdk-alpine AS extractor
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=extractor /app/dependencies/ ./
COPY --from=extractor /app/spring-boot-loader/ ./
COPY --from=extractor /app/snapshot-dependencies/ ./
COPY --from=extractor /app/application/ ./
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.JarLauncher"]
```

## Rust
```dockerfile
FROM rust:1.78-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -f target/release/deps/app*   # cache deps
COPY src ./src
RUN cargo build --release

FROM scratch
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/app /app
EXPOSE 8080
ENTRYPOINT ["/app"]
```

## Next.js / React (Standalone output)
```dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```
> Requires `output: 'standalone'` in `next.config.js`

## .dockerignore Template
```
node_modules/
.next/
dist/
build/
target/
__pycache__/
*.pyc
.venv/
.git/
.gitignore
*.md
.env
.env.*
!.env.example
coverage/
.nyc_output/
*.log
.DS_Store
Thumbs.db
.idea/
.vscode/
*.test.*
__tests__/
tests/
docs/
```
