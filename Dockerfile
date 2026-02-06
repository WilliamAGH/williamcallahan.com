# syntax=docker/dockerfile:1
##
## Multi-stage build for Next.js application with Bun
## Note: Requires BuildKit (DOCKER_BUILDKIT=1) for secret mount support
## Base registry defaults to AWS ECR Public mirror but can be overridden
## Some alternatives:
##   - docker.io/library
##   - ghcr.io/debian
##
ARG BASE_REGISTRY=public.ecr.aws/debian
##

# Using Debian instead of Alpine because @chroma-core/default-embed uses ONNX runtime
# which requires glibc (Alpine uses musl libc which is incompatible).
# TODO: Revert to Alpine when switching to self-hosted embeddings API or @chroma-core/openai
#
# ---------- Base stage ----------
# Bun is installed from GitHub releases to avoid oven/bun Docker Hub dependency.
FROM ${BASE_REGISTRY}/debian:bookworm-slim AS base

# 1. Install Bun from GitHub releases (avoids Docker Hub dependency on oven/bun image)
#    Pin to specific version for reproducibility. Supports both x86_64 and arm64.
ARG BUN_VERSION=1.3.2
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ca-certificates \
    && ARCH=$(dpkg --print-architecture) \
    && case "${ARCH}" in \
         amd64) BUN_ARCH="x64" ;; \
         arm64) BUN_ARCH="aarch64" ;; \
         *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" -o /tmp/bun.zip \
    && unzip /tmp/bun.zip -d /tmp \
    && mv /tmp/bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun \
    && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
    && rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH} \
    && apt-get purge -y unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# 2. Verify Bun installation
RUN bun --version

# ---------- Dependencies stage ----------
# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Set environment variable for Bun
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# 1. Copy only package files first (rarely changes)
#    Copying lock file separately ensures Docker caches the layer correctly
COPY package.json ./
COPY bun.lock* ./
COPY .husky ./.husky

# 2. Copy the init-csp-hashes script and config directory needed by postinstall
#    This is required because postinstall runs during bun install
COPY scripts/init-csp-hashes.ts ./scripts/init-csp-hashes.ts
COPY config ./config

# 3. Create generated/ directory for build-time generated files (CSP hashes, etc.)
RUN mkdir -p generated/bookmarks

# 4. Install dependencies with Bun, skipping third-party postinstall scripts to avoid native crashes.
#    Use --frozen-lockfile to keep deployments deterministic and prevent dependency drift.
#    Cache mounts are avoided so classic docker builds (DOCKER_BUILDKIT=0) continue to work.
RUN bun install --ignore-scripts --frozen-lockfile

# 5. Ensure CSP hashes file exists early for tooling that might import it
RUN bun scripts/init-csp-hashes.ts

# ---------- Pre-checks stage (lint + type-check, cached) ----------
# Use base image (which has Bun) and run checks with Bun instead of npm
# This avoids the Docker Hub dependency on node:22-bookworm-slim
FROM base AS checks
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# 1. Copy installed deps from previous deps stage (no BuildKit-only flags)
COPY --from=deps /app/node_modules ./node_modules
# Copy generated CSP hashes (created in deps stage, gitignored so COPY . . won't include it)
COPY --from=deps /app/generated ./generated

# 2. Copy source for analysis only (does not affect later build layers)
COPY . .

# 3. Run linter and type checker using Bun (Bun can run npm scripts).
#    Cache mounts are omitted to keep the Dockerfile compatible with non-BuildKit builders.
RUN bun run lint && bun run type-check

# ---------- Build stage (production build) ----------
# Use Bun image for build stage so `bun` commands are available
FROM base AS builder

# 1. System packages (rarely changes) - FIRST for maximum cache reuse
#    ca-certificates required for HTTPS connectivity checks (S3, CDN)
#    fontconfig + fonts-dejavu required for @react-pdf/renderer PDF generation during static generation
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl bash fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 2. Static environment variables (rarely changes)
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
ENV NODE_ENV=production
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
# Limit Sentry logging noise during builds (info keeps warnings/errors visible)
ENV SENTRY_LOG_LEVEL=info
# Disable Next.js "use cache" during build to prevent prerender timeouts
# The cache directive has strict timeouts that cause failures during SSG
ENV USE_NEXTJS_CACHE=false

# 3. Accept and propagate public env vars for Next.js build (changes occasionally)
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL
ARG DEPLOYMENT_ENV
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV DEPLOYMENT_ENV=$DEPLOYMENT_ENV

# --- S3 configuration (build-time and runtime) -------------------------------
# Only non-secret values are exported as ENV vars below. Secrets can be
# supplied either through BuildKit secrets (when available) or as build args for
# environments that only support classic docker builds (e.g., Railway).
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG NEXT_PUBLIC_S3_CDN_URL
ARG S3_ACCESS_KEY_ID
ARG S3_SECRET_ACCESS_KEY
ARG S3_SESSION_TOKEN
# Pass these as ENV for build process
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL
# NOTE: S3 credentials remain optional. Provide them via BuildKit secrets for
# secure builds or pass them as --build-arg when using classic docker builders.

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules
# Copy generated CSP hashes (created in deps stage, gitignored so COPY . . won't include it)
COPY --from=deps /app/generated ./generated

# Copy entire source code
COPY . .

# Sitemap generation and dynamic routes stream paginated data directly from S3/CDN at runtime,
# so no build-time bookmark snapshot is required.

# Quick connectivity verification so CI/CD logs capture upstream reachability before the Next.js build.
RUN bash -c 'set -euo pipefail \
  && if [ -n "${S3_SERVER_URL:-}" ]; then \
       echo "🔍 Checking S3 server connectivity at ${S3_SERVER_URL}" && \
       curl -fsSIL "${S3_SERVER_URL%%/}" >/dev/null; \
     else \
       echo "⚠️  S3_SERVER_URL not set; skipping server connectivity check"; \
     fi \
  && if [ -n "${NEXT_PUBLIC_S3_CDN_URL:-}" ]; then \
       echo "🔍 Checking CDN connectivity at ${NEXT_PUBLIC_S3_CDN_URL}" && \
       curl -fsSIL "${NEXT_PUBLIC_S3_CDN_URL%%/}" >/dev/null; \
     else \
       echo "⚠️  NEXT_PUBLIC_S3_CDN_URL not set; skipping CDN connectivity check"; \
     fi'

# Now build the app using bun (Bun) to avoid OOM issues
# Note: Bun uses JavaScriptCore which auto-manages memory, no --max-old-space-size support
# The build script in package.json sets NODE_OPTIONS for the Next.js build step
#
# BuildKit secrets are mounted directly as environment variables using the idiomatic
# --mount=type=secret,env= syntax (requires dockerfile:1 syntax directive).
# This provides S3 credentials just-in-time for generateStaticParams() without
# leaking secrets into the image layers or build cache.
# Ref: https://docs.docker.com/build/building/secrets/#secret-mounts
RUN --mount=type=secret,id=S3_ACCESS_KEY_ID,env=S3_ACCESS_KEY_ID \
    --mount=type=secret,id=S3_SECRET_ACCESS_KEY,env=S3_SECRET_ACCESS_KEY \
    --mount=type=secret,id=S3_SESSION_TOKEN,env=S3_SESSION_TOKEN \
    --mount=type=secret,id=NEXT_PUBLIC_S3_CDN_URL,env=NEXT_PUBLIC_S3_CDN_URL \
    --mount=type=secret,id=NEXT_PUBLIC_SITE_URL,env=NEXT_PUBLIC_SITE_URL \
    --mount=type=secret,id=NEXT_PUBLIC_UMAMI_WEBSITE_ID,env=NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    --mount=type=secret,id=DEPLOYMENT_ENV,env=DEPLOYMENT_ENV \
    --mount=type=secret,id=S3_BUCKET,env=S3_BUCKET \
    --mount=type=secret,id=S3_SERVER_URL,env=S3_SERVER_URL \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SENTRY_DSN,env=SENTRY_DSN \
    --mount=type=secret,id=NEXT_PUBLIC_SENTRY_DSN,env=NEXT_PUBLIC_SENTRY_DSN \
    bun run build \
    && (find /app/.next/cache -type f -mtime +5 -delete 2>/dev/null || true)

# ---------- Runtime stage ----------
# Production image, copy all the files and run next
# Layer order optimized: static/rarely-changing layers first, frequently-changing last
FROM base AS runner
WORKDIR /app

# 1. System packages (never changes) - FIRST for maximum cache reuse
#    Node.js for the Next.js production server, libvips for Sharp image processing,
#    curl for healthchecks, fontconfig + fonts-dejavu for @react-pdf/renderer
#    IMPORTANT: Debian Bookworm ships Node.js 18.x but Next.js 16 requires >=20.9.0.
#    We install Node.js 22.x LTS from NodeSource to meet this requirement.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg libvips42 bash fontconfig fonts-dejavu-core \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. Create non-root user (never changes) - standard UID 1001 for Next.js containers
#    Ensures consistent permissions with Coolify and other container orchestrators
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# 3. Static environment variables (rarely changes)
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Memory configuration for Node.js (used by Next.js server)
# Bun doesn't support this flag but Node.js respects it
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 4. Build arguments and environment (rarely changes, but after static layers)
#    Optionally inject the git commit at build time for release tracking:
#    docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) ...
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.revision=$GIT_SHA

# Re-declare the build args so we can forward them (ARG values are scoped per stage)
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG NEXT_PUBLIC_S3_CDN_URL
ARG DEPLOYMENT_ENV
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL

# Make sure they are present at runtime (can still be overridden with `docker run -e`)
# NOTE: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY should ONLY be injected at runtime
# via docker run -e or orchestration secrets to avoid baking them into the image
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL \
    DEPLOYMENT_ENV=$DEPLOYMENT_ENV \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# 5. Static dependencies (changes occasionally - when deps update)
#    Copy node_modules for runtime dependencies (read-only, no chown needed)
COPY --from=deps /app/node_modules ./node_modules

# 6. Static assets and config (changes occasionally)
#    Copy public directory (read-only static assets)
COPY --from=builder /app/public ./public
#    Copy data directory with all static data files (read-only)
COPY --from=builder /app/data ./data
#    Copy next.config so runtime uses the build-time image remotePatterns
COPY --from=builder /app/next.config.ts ./next.config.ts
#    Ensure TypeScript path-mapping files are available at runtime so that Bun can
#    resolve "@/*" import aliases used by our standalone scripts (e.g. update-s3).
COPY --from=builder /app/tsconfig*.json ./
#    Runtime helper scripts (`scripts/*.ts`) import source modules directly from the
#    repository (e.g. `@/lib/*`, `@/types/*`). The `@/*` alias maps to `./src/*` in
#    tsconfig.json, so we must copy the src/ subdirectories.
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/config ./config
#    Ensure the sitemap generator used by runtime scripts is available.
COPY --from=builder /app/src/app/sitemap.ts ./src/app/sitemap.ts

# 7. Scripts and package definitions (changes occasionally)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# 8. Create writable directories (after static copies, before dynamic content)
RUN mkdir -p /app/cache/s3_data && chown -R nextjs:nodejs /app/cache

# 9. Application build output (changes every build) - LAST for optimal caching
#    Copy Next.js build output with ownership set to nextjs user
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
#    Copy generated files (CSP hashes, bookmark caches for local fallback)
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated
#    Ensure local S3 cache path exists at runtime with proper ownership
RUN mkdir -p ./.next/cache/local-s3 && chown -R nextjs:nodejs ./.next/cache

# 10. Finalize permissions and switch to non-root user
USER nextjs

EXPOSE 3000

# Lightweight, robust healthcheck with response verification
# Uses health endpoint and verifies JSON response contains an acceptable status
# Accepts "healthy" or "degraded" (both return HTTP 200); only "unhealthy" fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS --connect-timeout 2 --max-time 3 "http://127.0.0.1:${PORT:-3000}/api/health" \
    | grep -qE '"status"[[:space:]]*:[[:space:]]*"(healthy|degraded)"' || exit 1

# Use entrypoint to handle data initialization, scheduler startup, and graceful shutdown
ENTRYPOINT ["/app/entrypoint.sh"]
# Run the package.json start script via Bun (available in the base image)
CMD ["bun", "run", "start"]
