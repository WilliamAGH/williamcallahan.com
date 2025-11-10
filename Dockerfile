# syntax=docker/dockerfile:1.16

FROM docker.io/oven/bun:1.2.22-alpine AS base

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
RUN --mount=type=cache,target=/root/.bun/install bun install --frozen-lockfile --ignore-scripts
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

# Copy installed deps from previous deps stage
COPY --from=deps --link /app/node_modules ./node_modules

# Copy source for analysis only (does not affect later build layers)
COPY . .

# Run linter and type checker with persistent cache mounts so they
#   do not re-run on every incremental build.
# Set memory limit for Node.js operations during checks
RUN --mount=type=cache,target=/app/.eslintcache \
    --mount=type=cache,target=/app/.tsbuildinfo \
    NODE_OPTIONS='--max-old-space-size=4096' npm run lint && NODE_OPTIONS='--max-old-space-size=4096' npm run type-check

# --------------------------------------------------
# BUILD STAGE (production build)
# --------------------------------------------------
# Use Bun image for build stage so `bun` commands are available
FROM base AS builder
# Install dependencies for the build
RUN apk add --no-cache libc6-compat curl bash
WORKDIR /app

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
# Set NODE_ENV for the build process
ENV NODE_ENV=production
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
# Enable verbose Sentry logs during build for better diagnostics
ENV SENTRY_LOG_LEVEL=debug

# Accept and propagate public env vars for Next.js build
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL
ARG DEPLOYMENT_ENV
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV DEPLOYMENT_ENV=$DEPLOYMENT_ENV

# --- S3 configuration (build-time and runtime) -------------------------------
# Only non-secret values as ARGs (bucket name, URLs)
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG S3_CDN_URL
ARG NEXT_PUBLIC_S3_CDN_URL
# Pass these as ENV for build process
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    S3_CDN_URL=$S3_CDN_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL
# NOTE: S3 credentials (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) are NOT needed at build time
# We fetch bookmarks from the PUBLIC S3 CDN URL which doesn't require authentication

# Copy dependencies and source code
COPY --from=deps --link /app/node_modules ./node_modules

# Copy entire source code
COPY . .

# CRITICAL: Fetch bookmark data from PUBLIC S3 CDN for sitemap generation
# Issue #sitemap-2024: Sitemap.xml was missing bookmark URLs in production because:
# 1. Next.js generates sitemap at BUILD time (during 'next build')
# 2. Bookmarks are in S3 (async-only), not local files like blog posts
# 3. Without this step, sitemap.ts gets empty data and generates no bookmark URLs
# @see app/sitemap.ts:149 - Calls getBookmarksForStaticBuildAsync()
# @see scripts/entrypoint.sh:14-23 - Runtime fetch is TOO LATE for sitemap
# 
# SOLUTION: Use PUBLIC S3 CDN URLs - no credentials needed!
# The S3 bucket is configured for public read access via CDN
RUN echo "📊 Fetching bookmark data from PUBLIC S3 CDN for sitemap generation..." && \
    echo "DEPLOYMENT_ENV: ${DEPLOYMENT_ENV:-NOT SET}" && \
    echo "S3_CDN_URL: ${S3_CDN_URL:-NOT SET}" && \
    echo "NEXT_PUBLIC_S3_CDN_URL: ${NEXT_PUBLIC_S3_CDN_URL:-NOT SET}" && \
    # Use public CDN URL to fetch bookmarks - no credentials needed!
    if [ -n "$S3_CDN_URL" ] || [ -n "$NEXT_PUBLIC_S3_CDN_URL" ]; then \
      echo "✅ CDN URL available, fetching bookmarks from public S3..." && \
      bun scripts/fetch-bookmarks-public.ts || \
      echo "⚠️  Warning: Bookmark fetch failed. Sitemap may be incomplete."; \
    else \
      echo "⚠️  Warning: No CDN URL configured (S3_CDN_URL or NEXT_PUBLIC_S3_CDN_URL)." && \
      echo "   Bookmarks cannot be fetched for sitemap generation." && \
      echo "   Continuing build without bookmarks in sitemap..."; \
    fi

# Pre-build checks disabled to avoid network hang during build

# Now build the app using bun (Bun) to avoid OOM issues
# Note: Bun uses JavaScriptCore which auto-manages memory, no --max-old-space-size support
# The build script in package.json sets NODE_OPTIONS for the Next.js build step
RUN --mount=type=cache,target=/app/.next/cache \
    echo "📦 Building the application..." && bun run build && \
    # Prune optimiser cache older than 5 days to keep layer small
    find /app/.next/cache -type f -mtime +5 -delete || true

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies including Node.js for the Next.js production server
# Note: We still need Node.js to run `next start` even though Bun is available
# Also installing vips for Sharp image processing, curl for healthchecks, and bash for scripts
# libc6-compat is required for Sharp/vips native bindings to work properly
RUN apk add --no-cache nodejs vips curl bash libc6-compat

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
# Copy node_modules for runtime dependencies
COPY --from=deps --link /app/node_modules ./node_modules

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
