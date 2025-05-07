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
# Install curl for diagnostic pings
RUN apk add --no-cache curl
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

# Directory creation is now handled by the populate-volumes.ts script
# RUN mkdir -p /app/data/images/logos # For logos data (Handled by script)
# RUN mkdir -p /app/data/images/logos/byId # For ID-based logos (Handled by script)
# RUN mkdir -p /app/data/github-activity # For GitHub projects/activity data (Handled by script)
# RUN mkdir -p /app/data/github-activity/repo_raw_weekly_stats # For granular GitHub stats (Handled by script)
# RUN mkdir -p /app/data/bookmarks # For bookmarks data (Handled by script)

# Copy entire source code
COPY . .

# CRITICAL STEP: Fill volumes directly BEFORE any server or build processes
# This ensures all data volumes are properly populated with external data
RUN echo "📡 Pinging GitHub API before populating volumes..." && \
    (curl -L -v --connect-timeout 10 https://api.github.com/zen && echo "GitHub API ping successful") || \
    (echo "⚠️ GitHub API ping failed before populating volumes. Check network/DNS." && false) # Fail build if critical ping fails

RUN echo "🚀 Populating all data volumes directly..." && bun scripts/populate-volumes.ts

# Now build the app with preloaded data volumes
RUN echo "📡 Pinging GitHub API before Next build..." && \
    (curl -L -v --connect-timeout 10 https://api.github.com/zen && echo "GitHub API ping successful") || \
    (echo "⚠️ GitHub API ping failed before Next build. Check network/DNS." && false) # Fail build if critical ping fails

RUN echo "📡 Pinging Sentry before Next build..." && \
    (curl -L -v --connect-timeout 10 https://o4509274058391557.ingest.us.sentry.io && echo "Sentry ping successful") || \
    (echo "⚠️ Sentry ping failed before Next build. Check network/DNS." && false) # Fail build if critical ping fails

RUN echo "📦 Building the application with populated data volumes..." && bun run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies (like Sharp's), curl for healthchecks, AND BASH
# Try using just 'vips' instead of 'vips-dev' and remove 'build-base' to reduce size.
# This assumes Sharp successfully installed its pre-compiled binaries in the 'deps' stage.
RUN apk add --no-cache vips curl bash

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output and required assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy scripts directory for prefetch capabilities
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Copy public directory and set permissions
COPY --from=builder /app/public ./public

# Copy data from builder image into staging directories for volume seeding
COPY --from=builder --chown=nextjs:nodejs /app/data/images/logos /app/.initial-logos
COPY --from=builder --chown=nextjs:nodejs /app/data/github-activity /app/.initial-github-activity
COPY --from=builder --chown=nextjs:nodejs /app/data/bookmarks /app/.initial-bookmarks

# Ensure the data directories exist and have correct permissions
RUN mkdir -p /app/data/images/logos && chown -R nextjs:nodejs /app/data/images/logos
RUN mkdir -p /app/data/github-activity && chown -R nextjs:nodejs /app/data/github-activity
RUN mkdir -p /app/data/bookmarks && chown -R nextjs:nodejs /app/data/bookmarks

# Copy entrypoint script to seed logos volume on startup
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create a volume for persisting logos
VOLUME /app/data/images/logos
# Create a volume for persisting github-projects data
VOLUME /app/data/github-activity
# Create a volume for persisting bookmarks data
VOLUME /app/data/bookmarks

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Add healthcheck to ensure the container is properly running
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use entrypoint to seed logos, then start server
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["bun", "server.js"]
