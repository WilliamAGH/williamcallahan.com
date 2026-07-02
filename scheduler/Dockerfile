# syntax=docker/dockerfile:1
##
## Scheduler container image (cron jobs, data updater, sitemap submission).
## No Next.js build — tsx runs TypeScript directly against src/lib, so this
## image builds in minutes and its deploys never compete with the web build.
##
## Build from the REPOSITORY ROOT context:
##   docker build -f scheduler/Dockerfile -t williamcallahan-scheduler:latest .
## (Coolify: docker-compose buildpack with scheduler/docker-compose.yml, or
##  Dockerfile buildpack with Base Directory "/" and this Dockerfile location.)
##
ARG BASE_REGISTRY=public.ecr.aws/debian

# ---------- Dependencies stage ----------
# Bun is installed only here, to produce node_modules from bun.lock.
FROM ${BASE_REGISTRY}/debian:bookworm-slim AS deps

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
    && rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH} \
    && apt-get purge -y unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV HUSKY=0

COPY package.json ./
COPY bun.lock* ./
# postinstall runs init-csp-hashes, which needs these before bun install
COPY scripts/init-csp-hashes.ts ./scripts/init-csp-hashes.ts
COPY config ./config
RUN mkdir -p generated/bookmarks \
    && bun install --ignore-scripts --frozen-lockfile \
    && bun scripts/init-csp-hashes.ts

# ---------- Runtime stage ----------
# Node.js 22 only (node --run + tsx from node_modules); libvips for Sharp.
FROM ${BASE_REGISTRY}/debian:bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg libvips42 bash procps \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

ENV NODE_ENV=production
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.revision=$GIT_SHA

# Dependencies and generated artifacts from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/generated ./generated

# Source needed by the tsx runtime graph ("@/*" aliases resolve via tsconfig)
COPY package.json tsconfig*.json ./
COPY config ./config
COPY data ./data
COPY public ./public
COPY src/lib ./src/lib
COPY src/types ./src/types
COPY src/app/sitemap.ts ./src/app/sitemap.ts
COPY scripts ./scripts
COPY --chown=nextjs:nodejs scheduler ./scheduler

RUN chmod +x /app/scheduler/entrypoint.sh /app/scheduler/diagnose-scheduler.sh \
    && mkdir -p /app/cache/s3_data && chown -R nextjs:nodejs /app/cache

USER nextjs

# The scheduler exposes no HTTP server; healthy = cron process alive.
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
  CMD pgrep -f "scheduler/scheduler.ts" > /dev/null || exit 1

ENTRYPOINT ["/app/scheduler/entrypoint.sh"]
CMD ["node", "--run", "scheduler"]
