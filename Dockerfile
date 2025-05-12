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
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
# Install curl and bash for scripts and diagnostic pings
RUN apk add --no-cache curl bash
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

# Now build the app
RUN echo "📦 Building the application..." && bun run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies (like Sharp), curl for healthchecks, AND BASH
# Trying to use just 'vips' instead of 'vips-dev' and remove 'build-base' to reduce size
# This assumes Sharp successfully installed its pre-compiled binaries in the 'deps' stage
RUN apk add --no-cache vips curl bash su-exec

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
COPY --from=builder /app/.next/static ./.next/static

# Copy scripts directory (run as root, so no chown needed)
COPY --from=builder /app/scripts ./scripts

# Copy script package definitions so the scheduler can run
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lockb ./bun.lockb

# Copy public directory (run as root, so no chown needed)
COPY --from=builder /app/public ./public

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
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use entrypoint to seed logos, then start server
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "server.js"]
