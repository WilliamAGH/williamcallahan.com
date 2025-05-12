#!/usr/bin/env bash
set -e # Exit on error

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
# Ensure the local cache directory exists. Permissions are handled by running as root.
# This directory should have been created in the Dockerfile runner stage.
mkdir -p /app/cache/s3_data
echo "✅ [Entrypoint] Cache directory /app/cache/s3_data ensured."

# REMOVED: Volume seeding logic as data is now in S3
# REMOVED: User switching logic - running as root

echo "🕒 [Entrypoint] Starting data scheduler in background..."
bun run scheduler &
SCHEDULER_PID=$!
echo "✅ [Entrypoint] Scheduler started (PID: $SCHEDULER_PID)"

echo "🚀 [Entrypoint] Starting main application..."

# Execute the command passed to the entrypoint (CMD in Dockerfile) directly as root
# The "$@" here expands to the CMD specified in the Dockerfile (e.g., ["bun", "server.js"])
exec "$@"
