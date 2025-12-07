FROM docker.io/oven/bun:1.3.2-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install dependencies required for packages like Sharp
RUN apk add --no-cache libc6-compat
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

# Install dependencies with Bun, skipping third-party postinstall scripts to avoid native crashes
# Cache mounts are avoided so classic docker builds (DOCKER_BUILDKIT=0) continue to work.
RUN bun install --frozen-lockfile --ignore-scripts
# Ensure CSP hashes file exists early for tooling that might import it
RUN bun scripts/init-csp-hashes.ts

# --------------------------------------------------
# PRE-CHECKS STAGE (lint + type-check, cached)
# --------------------------------------------------
FROM node:22-alpine AS checks
RUN apk add --no-cache libc6-compat bash
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
# fontconfig + ttf-dejavu required for @react-pdf/renderer and image processing during static generation
RUN apk add --no-cache libc6-compat curl bash fontconfig ttf-dejavu
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
RUN /bin/sh -c "set -euo pipefail; \
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
# Also installing vips for Sharp image processing, curl for healthchecks, and bash for scripts
# libc6-compat is required for Sharp/vips native bindings to work properly
# fontconfig + ttf-dejavu required for @react-pdf/renderer CV PDF generation at runtime
RUN apk add --no-cache nodejs vips curl bash libc6-compat fontconfig ttf-dejavu

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

# Copy Next.js build output (Turbopack doesn't use standalone)
COPY --from=builder /app/.next ./.next
# Ensure local S3 cache path exists at runtime (builder no longer materializes snapshots)
RUN mkdir -p ./.next/cache/local-s3
# Copy node_modules for runtime dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy scripts directory (run as root, so no chown needed)
COPY --from=builder /app/scripts ./scripts

# Copy script package definitions so the scheduler can run
COPY --from=builder /app/package.json ./package.json

# Copy public directory (run as root, so no chown needed)
COPY --from=builder /app/public ./public

# Copy data directory with all static data files
COPY --from=builder /app/data ./data

# Ensure TypeScript path-mapping files are available at runtime so that Bun can
# resolve "@/*" import aliases used by our standalone scripts (e.g. update-s3).
# We copy any root-level tsconfig variants that might contain the "paths" map.
COPY --from=builder /app/tsconfig*.json ./

# Runtime helper scripts (`scripts/*.ts`) import source modules directly from the
# repository (e.g. `@/lib/*`, `@/types/*`). These folders are *not* included in
# the Next.js production build output, so we need to copy them into the final image
# as well.
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/config ./config

# Ensure the sitemap generator used by runtime scripts is available.
# Only the specific file is copied to minimize image size and avoid unnecessary source files.
COPY --from=builder /app/app/sitemap.ts ./app/sitemap.ts

# REMOVED: Copying initial data from builder stage - data now lives in S3
# COPY --from=builder --chown=nextjs:nodejs /app/data/images/logos /app/.initial-logos
# COPY --from=builder --chown=nextjs:nodejs /app/data/github-activity /app/.initial-github-activity
# COPY --from=builder /app/data/bookmarks /app/.initial-bookmarks

# Ensure the local S3 cache directory exists with proper permissions
RUN mkdir -p /app/cache/s3_data
# REMOVED: Creating persistent data directories - data now lives in S3
# RUN mkdir -p /app/data/images/logos
# RUN mkdir -p /app/data/github-activity
# RUN mkdir -p /app/data/bookmarks

# Copy entrypoint script (run as root, so no chown needed)
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# REMOVED: VOLUME directives for data now in S3
# VOLUME /app/data/images/logos
# VOLUME /app/data/github-activity
# VOLUME /app/data/bookmarks

# REMOVED: USER directive - will run as root

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Memory configuration for Node.js (used by Next.js server)
# Bun doesn't support this flag but Node.js respects it
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Add healthcheck to ensure the container is properly running
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --silent --show-error --fail http://127.0.0.1:3000/api/health || exit 1

# Use entrypoint to handle data initialization, scheduler startup, and graceful shutdown
# Note: entrypoint.sh now includes initial data population before starting scheduler
ENTRYPOINT ["/app/entrypoint.sh"]
# Run the package.json start script via Bun (available in the base image)
CMD ["bun", "run", "start"]

ARG BUILDKIT_INLINE_CACHE=1
LABEL org.opencontainers.image.build=true
