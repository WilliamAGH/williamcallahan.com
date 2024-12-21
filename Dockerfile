FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies, enable pnpm, and install packages
RUN apk add --no-cache libc6-compat && \
    corepack enable && \
    corepack prepare pnpm@8.15.4 --activate

COPY package.json package-lock.json* pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm clean-install; \
    else \
      npm install; \
    fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Enable pnpm, run checks and build
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && \
    corepack prepare pnpm@8.15.4 --activate && \
    if [ -f pnpm-lock.yaml ]; then \
      pnpm run check-all && pnpm run build; \
    else \
      npm run check-all && npm run build; \
    fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Default values that can be overridden at runtime
ARG PORT=3000
ARG HOSTNAME=0.0.0.0

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=$PORT \
    HOSTNAME=$HOSTNAME

# Create non-root user and set up directories
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir .next && \
    chown nextjs:nodejs .next

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Use ARG value for EXPOSE
EXPOSE $PORT

CMD ["node", "server.js"]