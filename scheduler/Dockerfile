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

# ---------- Node stage ----------
# Install the package.json-declared official Node.js release once for both dependency and runtime stages.
FROM ${BASE_REGISTRY}/debian:bookworm-slim AS node
COPY package.json /tmp/node-runtime/package.json
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq xz-utils \
    && node_version="$(jq -er '.engines.node | strings | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' /tmp/node-runtime/package.json)" \
    && architecture="$(dpkg --print-architecture)" \
    && case "${architecture}" in \
         amd64) node_arch="x64" ;; \
         arm64) node_arch="arm64" ;; \
         *) echo "Unsupported architecture: ${architecture}" && exit 1 ;; \
       esac \
    && node_sha256="$(jq -er --arg architecture "${architecture}" '.runtime.node.linux[$architecture].sha256 | strings | select(test("^[a-f0-9]{64}$"))' /tmp/node-runtime/package.json)" \
    && node_archive="node-v${node_version}-linux-${node_arch}.tar.xz" \
    && curl -fsSL "https://nodejs.org/dist/v${node_version}/${node_archive}" -o "/tmp/${node_archive}" \
    && echo "${node_sha256}  /tmp/${node_archive}" | sha256sum --check --status \
    && tar -xJf "/tmp/${node_archive}" -C /usr/local --strip-components=1 \
    && node --version | grep -Fx "v${node_version}" \
    && rm -f "/tmp/${node_archive}" \
    && rm -rf /tmp/node-runtime \
    && apt-get purge -y --auto-remove jq xz-utils \
    && rm -rf /var/lib/apt/lists/*

# ---------- Dependencies stage ----------
# Bun is installed only here, to produce node_modules from bun.lock.
FROM node AS deps

ARG BUN_VERSION=1.3.2
RUN apt-get update && apt-get install -y --no-install-recommends \
    unzip \
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
# Package-declared checksum-pinned Node (node --run + tsx from node_modules); libvips and fontconfig for image/PDF paths.
FROM node AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 bash procps fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs

ENV NODE_ENV=production
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
ENV XDG_CACHE_HOME=/home/nextjs/.cache
ENV SCHEDULER_HEARTBEAT_FILE=/tmp/scheduler-heartbeat

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
    && mkdir -p /app/cache/s3_data /home/nextjs/.cache/fontconfig /home/nextjs/.fontconfig /var/cache/fontconfig \
    && fc-cache -f \
    && chown -R nextjs:nodejs /app/cache /home/nextjs /var/cache/fontconfig

USER nextjs

# The scheduler exposes no HTTP server; its event loop refreshes this heartbeat every 30 seconds.
HEALTHCHECK --interval=60s --timeout=5s --start-period=15m --retries=3 \
  CMD node -e 'const fs=require("node:fs");const timestamp=Number(fs.readFileSync(process.env.SCHEDULER_HEARTBEAT_FILE,"utf8"));const age=Date.now()-timestamp;if(!Number.isFinite(age)||age>120000)process.exit(1)'

ENTRYPOINT ["/app/scheduler/entrypoint.sh"]
CMD ["node", "--run", "scheduler"]
