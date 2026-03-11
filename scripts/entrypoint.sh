#!/usr/bin/env bash
set -euo pipefail

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

detect_railway_env() {
    if [ -n "${RAILWAY_STATIC_URL:-}" ] || \
       [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ] || \
       [ -n "${RAILWAY_PRIVATE_DOMAIN:-}" ] || \
       [ -n "${RAILWAY_PROJECT_NAME:-}" ] || \
       [ -n "${RAILWAY_PROJECT_ID:-}" ] || \
       [ -n "${RAILWAY_ENVIRONMENT_NAME:-}" ] || \
       [ -n "${RAILWAY_ENVIRONMENT_ID:-}" ] || \
       [ -n "${RAILWAY_SERVICE_NAME:-}" ] || \
       [ -n "${RAILWAY_SERVICE_ID:-}" ]; then
        return 0
    fi
    return 1
}

if [ -z "${ENABLE_BACKGROUND_SERVICES+x}" ]; then
    if detect_railway_env; then
        ENABLE_BACKGROUND_SERVICES=0
        echo "⚠️  [Entrypoint] Railway environment detected; disabling background services (set ENABLE_BACKGROUND_SERVICES=1 to override)."
    else
        ENABLE_BACKGROUND_SERVICES=1
    fi
fi

ENABLE_BACKGROUND_SERVICES="${ENABLE_BACKGROUND_SERVICES}"
SCHEDULER_PID=""
DATA_POPULATOR_PID=""
TAIL_PID=""

rewrite_database_url_for_internal_service
if is_canonical_production_runtime; then
    wait_for_database_readiness
fi

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
# Ensure the local cache directory exists. The directory is owned by nextjs:nodejs
# and was created with proper permissions in the Dockerfile runner stage.
mkdir -p /app/cache/s3_data
echo "✅ [Entrypoint] Cache directory /app/cache/s3_data ensured."

# NOTE: Container runs as non-root user 'nextjs' (UID 1001) for security.
# All writable directories are pre-created with proper ownership in Dockerfile.

echo "📊 [Entrypoint] Checking for initial data population..."
# Check if critical data exists, if not mark for background population
if ! slug_mapping_output="$(npx tsx scripts/debug-slug-mapping.ts 2>&1)"; then
    echo "❌ [Entrypoint] Failed to inspect slug mapping state"
    printf '%s\n' "$slug_mapping_output"
    exit 1
fi

if printf '%s\n' "$slug_mapping_output" | grep -q "Slug mapping exists"; then
    echo "✅ [Entrypoint] Data already exists, skipping initial population"
else
    echo "⚠️  [Entrypoint] Slug mapping missing, marking for background population..."
    # Create a marker file to trigger background population
    touch /tmp/needs-initial-data-population
    echo "✅ [Entrypoint] Marker created for background data population"
fi

if [ "${ENABLE_BACKGROUND_SERVICES}" = "1" ]; then
    echo "🗺️  [Entrypoint] Submitting sitemap..."
    if [ -n "${GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY:-}" ] && [ -n "${GOOGLE_SEARCH_INDEXING_SA_EMAIL:-}" ]; then
        if node --run submit-sitemap; then
            echo "✅ [Entrypoint] Sitemap submission completed"
        else
            echo "⚠️  [Entrypoint] Sitemap submission failed; continuing startup"
        fi
    else
        echo "⚠️  [Entrypoint] Missing Google sitemap credentials; skipping submission"
    fi

    echo "🕒 [Entrypoint] Starting background services..."

    # Start the background data populator if needed
    if [ -f /tmp/needs-initial-data-population ]; then
        echo "📦 [Entrypoint] Starting background data populator..."
        npx tsx scripts/background-data-populator.ts > /tmp/data-populator.log 2>&1 &
        DATA_POPULATOR_PID=$!
        echo "✅ [Entrypoint] Background data populator started (PID: $DATA_POPULATOR_PID)"
    fi

    # Create a log file for scheduler output (for debugging)
    SCHEDULER_LOG="/tmp/scheduler.log"
    echo "[$(date)] Scheduler startup initiated" > $SCHEDULER_LOG

    # Start scheduler directly without pipeline to get correct PID
    # Redirect output to both stdout and log file
    node --run scheduler >> $SCHEDULER_LOG 2>&1 &
    SCHEDULER_PID=$!
    echo "✅ [Entrypoint] Scheduler started (PID: $SCHEDULER_PID)"

    # Tail the log in background to show scheduler output
    tail -f $SCHEDULER_LOG 2>/dev/null | sed 's/^/[SCHEDULER] /' &
    TAIL_PID=$!

    # Verify scheduler is still running after 3 seconds
    sleep 3
    if kill -0 $SCHEDULER_PID 2>/dev/null; then
        echo "✅ [Entrypoint] Scheduler process verified running (PID: $SCHEDULER_PID)"
        # Show initial scheduler output
        echo "📋 [Entrypoint] Initial scheduler output:"
        head -n 10 $SCHEDULER_LOG | sed 's/^/    /'
    else
        echo "❌ [Entrypoint] ERROR: Scheduler process died immediately after starting"
        echo "❌ [Entrypoint] Last output from scheduler:"
        cat $SCHEDULER_LOG | sed 's/^/    /'
        echo "❌ [Entrypoint] Debug: Checking if node/tsx exist and scheduler script is accessible"
        which node || echo "    node not found in PATH"
        which npx || echo "    npx not found in PATH"
        ls -la package.json src/lib/server/scheduler.ts || echo "    scheduler files not found"
    fi
else
    echo "⚠️  [Entrypoint] ENABLE_BACKGROUND_SERVICES=${ENABLE_BACKGROUND_SERVICES}; skipping sitemap submission, scheduler, and background data population"
fi

# Set up signal handling to properly terminate background processes
cleanup() {
    echo "🛑 [Entrypoint] Received termination signal, cleaning up..."
    
    # Kill the tail process first
    if [ -n "$TAIL_PID" ] && kill -0 $TAIL_PID 2>/dev/null; then
        kill $TAIL_PID 2>/dev/null || true
    fi
    
    # Kill the data populator if running
    if [ -n "$DATA_POPULATOR_PID" ] && kill -0 $DATA_POPULATOR_PID 2>/dev/null; then
        echo "🛑 [Entrypoint] Terminating data populator (PID: $DATA_POPULATOR_PID)..."
        kill $DATA_POPULATOR_PID 2>/dev/null || true
        wait $DATA_POPULATOR_PID 2>/dev/null || true
    fi
    
    # Then kill the scheduler
    if [ -n "$SCHEDULER_PID" ] && kill -0 $SCHEDULER_PID 2>/dev/null; then
        echo "🛑 [Entrypoint] Terminating scheduler (PID: $SCHEDULER_PID)..."
        kill $SCHEDULER_PID 2>/dev/null || true
        wait $SCHEDULER_PID 2>/dev/null || true
    fi
    
    echo "✅ [Entrypoint] Cleanup complete"
    exit 0
}

# Trap signals to ensure clean shutdown
trap cleanup SIGTERM SIGINT SIGQUIT

echo "🚀 [Entrypoint] Starting main application..."

# Execute the command passed to the entrypoint (CMD in Dockerfile)
# The "$@" expands to the CMD specified in the Dockerfile (e.g., ["node", "--run", "start"])
# Running as non-root user 'nextjs' (UID 1001) for security
exec "$@"
