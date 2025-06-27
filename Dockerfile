FROM oven/bun:alpine AS base

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

# Install dependencies with Bun, allowing necessary lifecycle scripts
RUN --mount=type=cache,target=/root/.bun/install bun install --frozen-lockfile

# --------------------------------------------------
# PRE-CHECKS STAGE (lint + type-check, cached)
# --------------------------------------------------
FROM node:22-alpine AS checks
RUN apk add --no-cache libc6-compat bash
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# Copy installed deps from previous deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source for analysis only (does not affect later build layers)
COPY . .

# Run linter and type checker with persistent cache mounts so they
#   do not re-run on every incremental build.
RUN --mount=type=cache,target=/app/.eslintcache \
    --mount=type=cache,target=/app/.tsbuildinfo \
    npm run lint && npm run type-check

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
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules

# Copy entire source code
COPY . .

# Build-time S3 data update disabled; will run at runtime via scheduler

# Pre-build checks disabled to avoid network hang during build

# Now build the app using bun (Bun) to avoid OOM issues
RUN --mount=type=cache,target=/app/.next/cache \
    echo "📦 Building the application..." && bun run build && \
    # Prune optimiser cache older than 5 days to keep layer small
    find /app/.next/cache -type f -mtime +5 -delete || true

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies including Node.js for Next.js standalone compatibility
# Note: We need Node.js to run the Next.js standalone server even though Bun is available
# Also installing vips for Sharp image processing, curl for healthchecks, and bash for scripts
RUN apk add --no-cache nodejs npm vips curl bash su-exec

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true

# REMOVED: User/group creation for non-root user
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs

# Copy standalone output and required assets (run as root, so no chown needed)
COPY --from=builder /app/.next/standalone ./
# Ensure all node_modules (including those for scripts like scheduler) are available
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static

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
# the Next.js standalone output, so we need to copy them into the final image
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

# Add healthcheck to ensure the container is properly running
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --silent --show-error --fail http://127.0.0.1:3000/api/health || exit 1

# Use entrypoint to seed logos, then start server
# Note: We use Node.js to run the standalone server as it's more compatible
# with Next.js 15's standalone output, even though Bun is available in the runner
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]

ARG BUILDKIT_INLINE_CACHE=1
LABEL org.opencontainers.image.build=true

# Install Node.js for running Next.js build within Bun scripts
RUN apk add --no-cache nodejs npm
