#!/usr/bin/env bash
# Shared database gate for container entrypoints (web + scheduler).
# Source this file, then call:
#   rewrite_database_url_for_internal_service
#   wait_for_database_readiness   (gate startup until the DB endpoint accepts TCP)

CANONICAL_PRODUCTION_SITE_URL="https://williamcallahan.com"
EXTERNAL_PRODUCTION_DB_HOST="167.234.219.57"
EXTERNAL_PRODUCTION_DB_PORT="5438"
DEFAULT_INTERNAL_PRODUCTION_DB_HOST="q0kks8ww044c0o4w4o4ok408"
DEFAULT_INTERNAL_PRODUCTION_DB_PORT="5432"

is_canonical_production_runtime() {
    [ "${NEXT_PUBLIC_SITE_URL:-}" = "${CANONICAL_PRODUCTION_SITE_URL}" ]
}

rewrite_database_url_for_internal_service() {
    if ! is_canonical_production_runtime || [ -z "${DATABASE_URL:-}" ]; then
        return 0
    fi

    local internal_host="${INTERNAL_DATABASE_HOST:-$DEFAULT_INTERNAL_PRODUCTION_DB_HOST}"
    local internal_port="${INTERNAL_DATABASE_PORT:-$DEFAULT_INTERNAL_PRODUCTION_DB_PORT}"
    local rewritten_url
    rewritten_url="$(
        DATABASE_URL="$DATABASE_URL" \
        EXTERNAL_DB_HOST="$EXTERNAL_PRODUCTION_DB_HOST" \
        EXTERNAL_DB_PORT="$EXTERNAL_PRODUCTION_DB_PORT" \
        INTERNAL_DB_HOST="$internal_host" \
        INTERNAL_DB_PORT="$internal_port" \
        node <<'NODE'
const raw = process.env.DATABASE_URL ?? "";
if (!raw) {
  process.exit(0);
}
try {
  const parsed = new URL(raw);
  const currentPort = parsed.port || "5432";
  if (
    parsed.hostname === process.env.EXTERNAL_DB_HOST &&
    currentPort === process.env.EXTERNAL_DB_PORT
  ) {
    parsed.hostname = process.env.INTERNAL_DB_HOST ?? parsed.hostname;
    parsed.port = process.env.INTERNAL_DB_PORT ?? parsed.port;
    process.stdout.write(parsed.toString());
  }
} catch (e) {
  console.error("[Entrypoint] Failed to parse DATABASE_URL for internal rewrite:", e?.message ?? e);
  process.exit(1);
}
NODE
    )"

    if [ -n "$rewritten_url" ]; then
        export DATABASE_URL="$rewritten_url"
        echo "✅ [Entrypoint] Rewrote DATABASE_URL to internal DB service (${internal_host}:${internal_port}) for canonical production runtime"
    fi
}

check_database_endpoint_once() {
    node <<'NODE'
const net = require("node:net");
const raw = process.env.DATABASE_URL ?? "";
if (!raw) {
  process.exit(0);
}
let host;
let port;
try {
  const parsed = new URL(raw);
  host = parsed.hostname;
  port = Number.parseInt(parsed.port || "5432", 10);
  if (!host || !Number.isInteger(port) || port <= 0) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
const timeoutMs = Number.parseInt(process.env.DATABASE_CONNECTIVITY_TIMEOUT_MS || "3000", 10);
const socket = net.connect({ host, port });
const onFailure = () => {
  socket.destroy();
  process.exit(1);
};
const timer = setTimeout(onFailure, timeoutMs);
socket.on("connect", () => {
  clearTimeout(timer);
  socket.end();
  process.exit(0);
});
socket.on("error", onFailure);
NODE
}

wait_for_database_readiness() {
    if [ -z "${DATABASE_URL:-}" ]; then
        echo "⚠️  [Entrypoint] DATABASE_URL is empty; skipping database readiness gate"
        return 0
    fi

    local max_attempts="${DATABASE_STARTUP_MAX_ATTEMPTS:-30}"
    local retry_seconds="${DATABASE_STARTUP_RETRY_SECONDS:-2}"
    local attempt=1

    echo "🩺 [Entrypoint] Waiting for database endpoint readiness before startup..."
    while [ "$attempt" -le "$max_attempts" ]; do
        if check_database_endpoint_once; then
            echo "✅ [Entrypoint] Database endpoint is reachable"
            return 0
        fi
        echo "⏳ [Entrypoint] Database not reachable yet (attempt ${attempt}/${max_attempts}); retrying in ${retry_seconds}s"
        sleep "$retry_seconds"
        attempt=$((attempt + 1))
    done

    echo "❌ [Entrypoint] Database endpoint did not become reachable in time; exiting"
    return 1
}
