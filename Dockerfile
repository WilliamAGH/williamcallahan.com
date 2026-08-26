# syntax=docker/dockerfile:1
##
## Multi-stage build for Next.js application with Bun
## Note: Requires BuildKit (DOCKER_BUILDKIT=1) for secret mount support
## Base registry can be overridden via --build-arg BASE_REGISTRY=<your-registry>
## The value must include any publisher/namespace prefix so that
## ${BASE_REGISTRY}/debian:bookworm-slim resolves to a valid image.
## Examples:
##   - public.ecr.aws/debian  (ECR Public — publisher namespace required)
##   - docker.io/library       (Docker Hub official)
##   - your.mirror.example     (private mirror — flat namespace)
##
ARG BASE_REGISTRY=public.ecr.aws/debian

# Using Debian instead of Alpine because @chroma-core/default-embed uses ONNX runtime
# which requires glibc (Alpine uses musl libc which is incompatible).
# TODO: Revert to Alpine when switching to self-hosted embeddings API or @chroma-core/openai
#
# ---------- Node stage ----------
# Install the package.json-declared official Node.js release once for every descendant stage.
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

# ---------- Base stage ----------
# Bun is installed from GitHub releases to avoid oven/bun Docker Hub dependency.
FROM node AS base

# 1. Install Bun from GitHub releases (avoids Docker Hub dependency on oven/bun image)
#    Pin to specific version for reproducibility. Supports both x86_64 and arm64.
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
    && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
    && rm -rf /tmp/bun.zip /tmp/bun-linux-${BUN_ARCH} \
    && apt-get purge -y unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# 2. Verify Bun installation
RUN bun --version

# ---------- Dependencies stage ----------
# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Set environment variable for Bun
ENV BUN_INSTALL_CACHE=/root/.bun/install/cache
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0

# 1. Copy only package files first (rarely changes)
#    Copying lock file separately ensures Docker caches the layer correctly
COPY package.json ./
COPY bun.lock* ./

# 2. Copy the init-csp-hashes script and config directory needed by postinstall
#    This is required because postinstall runs during bun install
COPY scripts/init-csp-hashes.ts ./scripts/init-csp-hashes.ts
COPY config ./config

# 3. Create generated/ directory for build-time generated files (CSP hashes, etc.)
RUN mkdir -p generated/bookmarks

# 4. Install dependencies with Bun, skipping third-party postinstall scripts to avoid native crashes.
#    Use --frozen-lockfile to keep deployments deterministic and prevent dependency drift.
#    Cache mounts are avoided so classic docker builds (DOCKER_BUILDKIT=0) continue to work.
RUN bun install --ignore-scripts --frozen-lockfile

# 5. Ensure CSP hashes file exists early for tooling that might import it
RUN bun scripts/init-csp-hashes.ts

# ---------- Build stage (production build) ----------
# Use the shared base stage so Bun commands and the exact Node.js runtime are available.
FROM base AS builder

# 1. System packages (rarely changes) - FIRST for maximum cache reuse
#    ca-certificates required for HTTPS connectivity checks (S3, CDN)
#    fontconfig + fonts-dejavu required for @react-pdf/renderer PDF generation during static generation
#    The package-declared checksum-pinned Node runtime is inherited so Next.js builds on Node.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash fontconfig fonts-dejavu-core git ripgrep \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 2. Static environment variables (rarely changes)
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUSKY=0
ENV NODE_ENV=production
# Indicate process is running inside Docker container
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
# Limit Sentry logging noise during builds (info keeps warnings/errors visible)
ENV SENTRY_LOG_LEVEL=info
# Disable Next.js "use cache" during build to prevent prerender timeouts
# The cache directive has strict timeouts that cause failures during SSG
ENV USE_NEXTJS_CACHE=false
# Prevent V8 OOM during SSG — default ~4GB is insufficient when generating
# 200+ pages with MDX compilation and Sharp blur placeholders
ENV NODE_OPTIONS="--max-old-space-size=8192"
# Serialize static page generation to reduce peak memory and DB pool contention
ENV STATIC_GEN_CONCURRENCY=1
ARG SOURCE_COMMIT=unknown

# 3. Accept and propagate public env vars for Next.js build (changes occasionally)
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL
ARG DEPLOYMENT_ENV
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV DEPLOYMENT_ENV=$DEPLOYMENT_ENV

# --- S3 configuration (build-time and runtime) -------------------------------
# Non-secret values are exported as ENV vars and should be supplied via build args
# when available so build-time and runtime configuration stay in sync.
# Sensitive credentials can still be supplied as BuildKit secrets.
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG NEXT_PUBLIC_S3_CDN_URL
# Pass these as ENV for build process
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL
# NOTE: S3_SECRET_ACCESS_KEY is required for builds (used by generateStaticParams).
# Other S3 credentials are optional. Provide via BuildKit secrets for secure
# builds or pass as --build-arg when using classic docker builders.

# Copy dependencies and source code
COPY --from=deps /app/node_modules ./node_modules
# Copy generated CSP hashes (created in deps stage, gitignored so COPY . . won't include it)
COPY --from=deps /app/generated ./generated

# Copy entire source code
COPY . .

# Sitemap generation and dynamic routes stream paginated data directly from S3/CDN at runtime,
# so no build-time bookmark snapshot is required.

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

# Build orchestration runs through Bun scripts, but Next.js build runs on Node.
# This keeps cacheComponents timer semantics aligned with Next.js expectations.
#
# Credentials are mounted directly as environment variables. Public Coolify
# values use canonical secret filenames and only replace ARG/ENV values when
# present, so absent optional secrets cannot erase build arguments.
# S3_SESSION_TOKEN is mirrored to AWS_SESSION_TOKEN for SDK compatibility.
# Ref: https://docs.docker.com/build/building/secrets/#secret-mounts
RUN --mount=type=secret,id=S3_ACCESS_KEY_ID,env=S3_ACCESS_KEY_ID,required=false \
    --mount=type=secret,id=S3_SECRET_ACCESS_KEY,env=S3_SECRET_ACCESS_KEY,required=false \
    --mount=type=secret,id=S3_SESSION_TOKEN,env=S3_SESSION_TOKEN,required=false \
    --mount=type=secret,id=DATABASE_URL,env=DATABASE_URL,required=false \
    --mount=type=secret,id=S3_BUCKET,target=/run/secrets/build/S3_BUCKET,required=false \
    --mount=type=secret,id=S3_SERVER_URL,target=/run/secrets/build/S3_SERVER_URL,required=false \
    --mount=type=secret,id=NEXT_PUBLIC_S3_CDN_URL,target=/run/secrets/build/NEXT_PUBLIC_S3_CDN_URL,required=false \
    --mount=type=secret,id=NEXT_PUBLIC_SITE_URL,target=/run/secrets/build/NEXT_PUBLIC_SITE_URL,required=false \
    --mount=type=secret,id=NEXT_PUBLIC_UMAMI_WEBSITE_ID,target=/run/secrets/build/NEXT_PUBLIC_UMAMI_WEBSITE_ID,required=false \
    --mount=type=secret,id=DEPLOYMENT_ENV,target=/run/secrets/build/DEPLOYMENT_ENV,required=false \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN,required=false \
    --mount=type=secret,id=SENTRY_DSN,env=SENTRY_DSN,required=false \
    --mount=type=secret,id=NEXT_PUBLIC_SENTRY_DSN,env=NEXT_PUBLIC_SENTRY_DSN,required=false \
    bash -c 'set -euo pipefail \
      && for secret_path in /run/secrets/build/*; do if [ -f "${secret_path}" ]; then name="${secret_path##*/}"; value="$(cat "${secret_path}")"; if [ -n "${value}" ]; then export "${name}=${value}"; fi; fi; done \
      && if [ -n "${S3_SESSION_TOKEN:-}" ]; then export AWS_SESSION_TOKEN="${S3_SESSION_TOKEN}"; fi \
      && if [ -n "${SOURCE_COMMIT:-}" ] && [ "${SOURCE_COMMIT}" != "unknown" ]; then \
        release_id="${SOURCE_COMMIT}"; \
      else \
        release_id="$(git rev-parse --short HEAD)"; \
        echo "Derived deployment ID from the Git build context because SOURCE_COMMIT was not supplied."; \
      fi \
      && export GIT_HASH="${release_id}" \
      && export NEXT_DEPLOYMENT_ID="${release_id}" \
      && echo "Building Next.js deployment ${release_id}" \
      && bun run build \
      && (find /app/.next/cache -type f -mtime +5 -delete 2>/dev/null || true)'

# ---------- Runtime stage ----------
# Production image, copy all the files and run next
# Layer order optimized: static/rarely-changing layers first, frequently-changing last
FROM base AS runner
WORKDIR /app

# 1. System packages (never changes) - FIRST for maximum cache reuse
#    Node.js for the Next.js production server, libvips for Sharp image processing,
#    curl for healthchecks, fontconfig + fonts-dejavu for @react-pdf/renderer
#    The package-declared checksum-pinned Node runtime is inherited from the node stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 bash fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# 2. Create non-root user (never changes) - standard UID 1001 for Next.js containers
#    Ensures consistent permissions with Coolify and other container orchestrators
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs

# 3. Static environment variables (rarely changes)
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV RUNNING_IN_DOCKER=true
ENV CONTAINER=true
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# 4. Build arguments and environment (rarely changes, but after static layers)
# Coolify supplies SOURCE_COMMIT only when Include Source Commit in Build is enabled.
# The UUID fallback is a deployment identity, not a source-control revision.
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT

# Re-declare the build args so we can forward them (ARG values are scoped per stage)
ARG S3_BUCKET
ARG S3_SERVER_URL
ARG NEXT_PUBLIC_S3_CDN_URL
ARG DEPLOYMENT_ENV
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_SITE_URL

# Make sure they are present at runtime (can still be overridden with `docker run -e`)
# NOTE: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY should ONLY be injected at runtime
# via docker run -e or orchestration secrets to avoid baking them into the image
ENV S3_BUCKET=$S3_BUCKET \
    S3_SERVER_URL=$S3_SERVER_URL \
    NEXT_PUBLIC_S3_CDN_URL=$NEXT_PUBLIC_S3_CDN_URL \
    DEPLOYMENT_ENV=$DEPLOYMENT_ENV \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    XDG_CACHE_HOME=/home/nextjs/.cache \
    # Disable Next.js "use cache" in production runtime due to "Connection closed" instability
    USE_NEXTJS_CACHE=false

# 5. Static dependencies (changes occasionally - when deps update)
#    Copy node_modules for runtime dependencies (read-only, no chown needed)
COPY --from=deps /app/node_modules ./node_modules

# 6. Static assets and config (changes occasionally)
#    Copy public directory (read-only static assets)
COPY --from=builder /app/public ./public
#    Copy data directory with all static data files (read-only)
COPY --from=builder /app/data ./data
#    Copy next.config so runtime uses the build-time image remotePatterns
COPY --from=builder /app/next.config.ts ./next.config.ts
#    Ensure TypeScript path-mapping files are available at runtime so that tsx can
#    resolve "@/*" import aliases used by our standalone scripts (e.g. update-data).
COPY --from=builder /app/tsconfig*.json ./
#    Runtime helper scripts (`scripts/*.ts`) import source modules directly from the
#    repository (e.g. `@/lib/*`, `@/types/*`). The `@/*` alias maps to `./src/*` in
#    tsconfig.json, so we must copy the src/ subdirectories.
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/config ./config
#    Ensure the sitemap generator used by copied verification scripts is available.
COPY --from=builder /app/src/app/sitemap.ts ./src/app/sitemap.ts

# 7. Scripts and package definitions (changes occasionally)
#    All runtime scripts use tsx (Node.js + esbuild) for TLS compatibility with PostgreSQL.
#    Database backfill/migration scripts (*.node.mjs) use #!/usr/bin/env node directly.
#    See AGENTS.md [RT1] for details.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# 8. Create writable directories (after static copies, before dynamic content)
RUN mkdir -p /app/cache/s3_data /home/nextjs/.cache/fontconfig /home/nextjs/.fontconfig /var/cache/fontconfig \
    && fc-cache -f \
    && chown -R nextjs:nodejs /app/cache /home/nextjs /var/cache/fontconfig

# 9. Application build output (changes every build) - LAST for optimal caching
#    Copy Next.js build output with ownership set to nextjs user
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
#    Copy generated files (CSP hashes, bookmark caches for local fallback)
COPY --from=builder --chown=nextjs:nodejs /app/generated ./generated
#    Ensure local S3 cache path exists at runtime with proper ownership
RUN mkdir -p ./.next/cache/local-s3 && chown -R nextjs:nodejs ./.next/cache

# 10. Finalize permissions and switch to non-root user
USER nextjs

EXPOSE 3000

# Lightweight, robust healthcheck with response verification
# Uses health endpoint and verifies JSON response contains an acceptable status
# Accepts "healthy" or "degraded" (both return HTTP 200); only "unhealthy" fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS --connect-timeout 2 --max-time 3 "http://127.0.0.1:${PORT:-3000}/api/health" \
    | grep -qE '"status"[[:space:]]*:[[:space:]]*"(healthy|degraded)"' || exit 1

# Entrypoint gates startup on database readiness, then serves traffic only.
# Background data work runs in the scheduler container (scheduler/Dockerfile).
ENTRYPOINT ["/app/entrypoint.sh"]
# Run the package.json start script via Node.js (node --run reads package.json scripts natively)
CMD ["node", "--run", "start"]
