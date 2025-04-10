FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Set environment variables for dependency installation
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PATH:$PNPM_HOME
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# Install pnpm first
RUN npm install -g pnpm

# Copy only package files first
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --unsafe-perm --ignore-scripts

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Set environment variables for build
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PATH:$PNPM_HOME
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
ENV NODE_ENV=development

# Install pnpm globally
RUN npm install -g pnpm

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN NODE_ENV=production pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install sharp dependencies and curl for healthchecks
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
RUN mkdir -p /app/public/logos && chown -R nextjs:nodejs /app/public

# Create a volume for persisting logos
VOLUME /app/public/logos

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Add healthcheck to ensure the container is properly running
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
