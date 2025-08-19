#!/usr/bin/env bash
set -e # Exit on error

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
# Ensure the local cache directory exists. Permissions are handled by running as root.
# This directory should have been created in the Dockerfile runner stage.
mkdir -p /app/cache/s3_data
echo "✅ [Entrypoint] Cache directory /app/cache/s3_data ensured."

# REMOVED: Volume seeding logic as data is now in S3
# REMOVED: User switching logic - running as root

echo "📊 [Entrypoint] Checking for initial data population..."
# Check if critical data exists, if not populate immediately
if ! bun scripts/debug-slug-mapping.ts 2>/dev/null | grep -q "Slug mapping exists"; then
    echo "⚠️  [Entrypoint] Slug mapping missing, running initial data population..."
    bun scripts/data-updater.ts --bookmarks --force || {
        echo "⚠️  [Entrypoint] Data updater failed, trying ensure-slug-mappings fallback..."
        bun scripts/ensure-slug-mappings.ts --force --all-paths
    }
else
    echo "✅ [Entrypoint] Data already exists, skipping initial population"
fi

echo "🗺️  [Entrypoint] Submitting sitemap..."
bun run submit-sitemap || true

echo "🕒 [Entrypoint] Starting data scheduler in background..."

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

# Set up signal handling to properly terminate background processes
cleanup() {
    echo "🛑 [Entrypoint] Received termination signal, cleaning up..."
    
    # Kill the tail process first
    if [ -n "$TAIL_PID" ] && kill -0 $TAIL_PID 2>/dev/null; then
        kill $TAIL_PID 2>/dev/null || true
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
# The "$@" here expands to the CMD specified in the Dockerfile (e.g., ["node", ".next/standalone/server.js"])
exec "$@"
