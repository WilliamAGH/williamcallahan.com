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
WORKDIR /app

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
# Set NODE_ENV for the build process
ENV NODE_ENV=production

# Accept and propagate public env vars for Next.js build
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application using Bun
RUN bun run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies (like Sharp's) and curl for healthchecks
RUN apk add --no-cache vips-dev build-base curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output and required assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public directory and set permissions
COPY --from=builder /app/public ./public
# Ensure the logos directory exists within public before chown
RUN mkdir -p /app/public/logos && chown -R nextjs:nodejs /app/public

# Create a volume for persisting logos (if needed, though usually served from build)
VOLUME /app/public/logos

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Add healthcheck to ensure the container is properly running
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run the Next.js standalone server using Bun
CMD ["bun", "server.js"]
