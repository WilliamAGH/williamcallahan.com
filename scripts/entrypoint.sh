#!/usr/bin/env bash
set -e # Exit on error

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

if [ -z "${ENABLE_BACKGROUND_SERVICES+x}" ]; then
    if [ -n "${RAILWAY_ENVIRONMENT_NAME:-}" ] || [ -n "${RAILWAY_PROJECT_ID:-}" ] || [ -n "${RAILWAY_SERVICE_ID:-}" ]; then
        ENABLE_BACKGROUND_SERVICES="0"
        echo "⚠️  [Entrypoint] Railway environment detected; background services disabled by default"
    else
        ENABLE_BACKGROUND_SERVICES="1"
    fi
fi
ENABLE_BACKGROUND_SERVICES="${ENABLE_BACKGROUND_SERVICES}"
SCHEDULER_PID=""
DATA_POPULATOR_PID=""
TAIL_PID=""

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
# Ensure the local cache directory exists. Permissions are handled by running as root.
# This directory should have been created in the Dockerfile runner stage.
mkdir -p /app/cache/s3_data
echo "✅ [Entrypoint] Cache directory /app/cache/s3_data ensured."

# REMOVED: Volume seeding logic as data is now in S3
# REMOVED: User switching logic - running as root

echo "📊 [Entrypoint] Checking for initial data population..."
# Check if critical data exists, if not mark for background population
if ! bun scripts/debug-slug-mapping.ts 2>/dev/null | grep -q "Slug mapping exists"; then
    echo "⚠️  [Entrypoint] Slug mapping missing, marking for background population..."
    # Create a marker file to trigger background population
    touch /tmp/needs-initial-data-population
    echo "✅ [Entrypoint] Marker created for background data population"
else
    echo "✅ [Entrypoint] Data already exists, skipping initial population"
fi

if [ "${ENABLE_BACKGROUND_SERVICES}" = "1" ]; then
    echo "🗺️  [Entrypoint] Submitting sitemap..."
    if [ -n "${GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY:-}" ] && [ -n "${GOOGLE_SEARCH_INDEXING_SA_EMAIL:-}" ]; then
        if bun run submit-sitemap; then
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
        bun scripts/background-data-populator.ts > /tmp/data-populator.log 2>&1 &
        DATA_POPULATOR_PID=$!
        echo "✅ [Entrypoint] Background data populator started (PID: $DATA_POPULATOR_PID)"
    fi

    # Create a log file for scheduler output (for debugging)
    SCHEDULER_LOG="/tmp/scheduler.log"
    echo "[$(date)] Scheduler startup initiated" > $SCHEDULER_LOG

    # Start scheduler directly without pipeline to get correct PID
    # Redirect output to both stdout and log file
    bun run scheduler >> $SCHEDULER_LOG 2>&1 &
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
        echo "❌ [Entrypoint] Debug: Checking if bun exists and scheduler script is accessible"
        which bun || echo "    bun not found in PATH"
        ls -la package.json lib/server/scheduler.ts || echo "    scheduler files not found"
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

# Execute the command passed to the entrypoint (CMD in Dockerfile) directly as root
# The "$@" here expands to the CMD specified in the Dockerfile (e.g., ["npx", "next", "start"])
exec "$@"
