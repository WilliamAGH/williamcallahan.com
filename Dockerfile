# Using Debian instead of Alpine because @chroma-core/default-embed uses ONNX runtime
# which requires glibc (Alpine uses musl libc which is incompatible).
# TODO: Revert to Alpine when switching to self-hosted embeddings API or @chroma-core/openai
FROM docker.io/oven/bun:1.3.2-debian AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Set environment variable for Bun
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# Copy only package files first
# Copying bun.lockb separately ensures Docker caches the layer correctly
COPY package.json ./
COPY bun.lockb* ./
COPY .husky ./.husky

# Copy the init-csp-hashes script and config directory needed by postinstall
# This is required because postinstall runs during bun install
COPY scripts/init-csp-hashes.ts ./scripts/init-csp-hashes.ts
COPY config ./config

# Create generated/ directory for build-time generated files (CSP hashes, etc.)
RUN mkdir -p generated/bookmarks

# Install dependencies with Bun, skipping third-party postinstall scripts to avoid native crashes.
# Note: --frozen-lockfile is intentionally omitted so Docker rebuilds can pick up newer
# semver-compatible versions (e.g., CVE patches for next/react) without requiring a new commit.
# Cache mounts are avoided so classic docker builds (DOCKER_BUILDKIT=0) continue to work.
RUN bun install --ignore-scripts
# Ensure CSP hashes file exists early for tooling that might import it
RUN bun scripts/init-csp-hashes.ts

# --------------------------------------------------
# PRE-CHECKS STAGE (lint + type-check, cached)
# --------------------------------------------------
FROM node:22-bookworm-slim AS checks
RUN apt-get update && apt-get install -y --no-install-recommends bash && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# Copy installed deps from previous deps stage (no BuildKit-only flags)
COPY --from=deps /app/node_modules ./node_modules

# Copy source for analysis only (does not affect later build layers)
COPY . .

# Run linter and type checker. Cache mounts are omitted to keep the Dockerfile
# compatible with non-BuildKit builders such as Railway's classic Docker engine.
RUN NODE_OPTIONS='--max-old-space-size=4096' npm run lint && NODE_OPTIONS='--max-old-space-size=4096' npm run type-check

# --------------------------------------------------
# BUILD STAGE (production build)
# --------------------------------------------------
# Use Bun image for build stage so `bun` commands are available
FROM base AS builder
# Install dependencies for the build
# ca-certificates required for HTTPS connectivity checks (S3, CDN)
# fontconfig + fonts-dejavu required for @react-pdf/renderer PDF generation during static generation
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl bash fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
# Set NODE_ENV for the build process
ENV NODE_ENV=production
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
# Limit Sentry logging noise during builds (info keeps warnings/errors visible)
ENV SENTRY_LOG_LEVEL=info

# Accept and propagate public env vars for Next.js build
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
ARG S3_CDN_URL
ARG NEXT_PUBLIC_S3_CDN_URL
ARG S3_ACCESS_KEY_ID
ARG S3_SECRET_ACCESS_KEY
ARG S3_SESSION_TOKEN
ARG API_BASE_URL
# Pass these as ENV for build process
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    S3_CDN_URL=$S3_CDN_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL
# NOTE: S3 credentials remain optional. Provide them via BuildKit secrets for
# secure builds or pass them as --build-arg when using classic docker builders.

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules

# Copy entire source code
COPY . .

# Previously we materialised the entire bookmark corpus during build. As of 2025-11, sitemap
# generation and dynamic routes stream paginated data directly from S3/CDN at runtime, so no
# build-time snapshot is required here.

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

# Pre-build checks disabled to avoid network hang during build

# Now build the app using bun (Bun) to avoid OOM issues
# Note: Bun uses JavaScriptCore which auto-manages memory, no --max-old-space-size support
# The build script in package.json sets NODE_OPTIONS for the Next.js build step
# Optional BuildKit secrets provide S3 credentials just-in-time for the build so
# generateStaticParams() can read bookmarks from S3 without leaking secrets.
# NOTE: The multiline bash snippet below uses explicit continuations so Docker
#       treats it as a single RUN instruction during BuildKit parsing.
RUN bash -c "set -euo pipefail; \
      if [ -n \"${S3_ACCESS_KEY_ID:-}\" ]; then export S3_ACCESS_KEY_ID=\"${S3_ACCESS_KEY_ID}\"; fi; \
      if [ -n \"${S3_SECRET_ACCESS_KEY:-}\" ]; then export S3_SECRET_ACCESS_KEY=\"${S3_SECRET_ACCESS_KEY}\"; fi; \
      if [ -n \"${S3_SESSION_TOKEN:-}\" ]; then export AWS_SESSION_TOKEN=\"${S3_SESSION_TOKEN}\"; export S3_SESSION_TOKEN=\"${S3_SESSION_TOKEN}\"; fi; \
      if [ -n \"${API_BASE_URL:-}\" ]; then export API_BASE_URL=\"${API_BASE_URL}\"; fi; \
      if [ -n \"${BUILDKIT_SANDBOX_HOSTNAME:-}\" ]; then \
        echo \"⚙️  BuildKit sandbox detected (${BUILDKIT_SANDBOX_HOSTNAME}); proceeding with standard build\"; \
      else \
        echo \"⚙️  Classic docker build detected; cache mounts and BuildKit secrets disabled\"; \
      fi; \
      echo \"📦 Building the application...\"; \
      bun run build; \
      # Prune optimiser cache older than 5 days to keep layer small
      find /app/.next/cache -type f -mtime +5 -delete || true"

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies including Node.js for the Next.js production server
# Note: We still need Node.js to run `next start` even though Bun is available
# Also installing libvips for Sharp image processing, curl for healthchecks, and bash for scripts
# fontconfig + fonts-dejavu required for @react-pdf/renderer PDF generation at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs libvips42 curl bash fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security (UID 1001 is standard for Next.js containers)
# This ensures consistent permissions with Coolify and other container orchestrators
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true

# Re-declare the build args so we can forward them (ARG values are scoped per stage)
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG S3_CDN_URL
ARG NEXT_PUBLIC_S3_CDN_URL
ARG DEPLOYMENT_ENV
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL

# Make sure they are present at runtime (can still be overridden with `docker run -e`)
# NOTE: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY should ONLY be injected at runtime
# via docker run -e or orchestration secrets to avoid baking them into the image
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    S3_CDN_URL=$S3_CDN_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL \
    DEPLOYMENT_ENV=$DEPLOYMENT_ENV \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Copy Next.js build output with ownership set to nextjs user
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# Ensure local S3 cache path exists at runtime with proper ownership
RUN mkdir -p ./.next/cache/local-s3 && chown -R nextjs:nodejs ./.next/cache

# Copy node_modules for runtime dependencies (read-only, no chown needed)
COPY --from=deps /app/node_modules ./node_modules

# Copy scripts directory
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Copy script package definitions so the scheduler can run
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy public directory (read-only static assets)
COPY --from=builder /app/public ./public

# Copy data directory with all static data files (read-only)
COPY --from=builder /app/data ./data

# Ensure TypeScript path-mapping files are available at runtime so that Bun can
# resolve "@/*" import aliases used by our standalone scripts (e.g. update-s3).
COPY --from=builder /app/tsconfig*.json ./

# Runtime helper scripts (`scripts/*.ts`) import source modules directly from the
# repository (e.g. `@/lib/*`, `@/types/*`). The `@/*` alias maps to `./src/*` in
# tsconfig.json, so we must copy the src/ subdirectories. These folders are *not*
# included in the Next.js production build output.
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/config ./config
# Copy generated files (CSP hashes, bookmark caches for local fallback)
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated

# Ensure the sitemap generator used by runtime scripts is available.
# Only the specific file is copied to minimize image size.
COPY --from=builder /app/src/app/sitemap.ts ./src/app/sitemap.ts

# Create writable cache directory with proper ownership for non-root user
RUN mkdir -p /app/cache/s3_data && chown -R nextjs:nodejs /app/cache

# Copy entrypoint script and make executable
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user for security
# UID 1001 is standard for Next.js and works reliably with Coolify
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Memory configuration for Node.js (used by Next.js server)
# Bun doesn't support this flag but Node.js respects it
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Add healthcheck to ensure the container is properly running
# Use the PORT env var if provided by the platform; default to 3000 otherwise
HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=3 \
  CMD sh -c 'curl --silent --show-error --fail "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1'

# Use entrypoint to handle data initialization, scheduler startup, and graceful shutdown
# Note: entrypoint.sh now includes initial data population before starting scheduler
ENTRYPOINT ["/app/entrypoint.sh"]
# Run the package.json start script via Bun (available in the base image)
CMD ["bun", "run", "start"]

ARG BUILDKIT_INLINE_CACHE=1
LABEL org.opencontainers.image.build=true
