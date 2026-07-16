#!/usr/bin/env bash
# Scheduler container entrypoint: database gate, initial data bootstrap,
# one-time sitemap submission, then the scoped cron scheduler as PID 1.
# The web container (scripts/entrypoint.sh) serves traffic only.
set -euo pipefail

# shellcheck source=scripts/entrypoint-db-gate.sh
source /app/scripts/entrypoint-db-gate.sh

rewrite_database_url_for_internal_service
if is_canonical_production_runtime; then
    wait_for_database_readiness
fi

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
mkdir -p /app/cache/s3_data

is_scheduler_command() {
    [ "$#" -eq 3 ] && [ "$1" = "node" ] && [ "$2" = "--run" ] && [ "$3" = "scheduler" ]
}

if ! is_scheduler_command "$@"; then
    echo "[Entrypoint] Running one-shot command: $*"
    exec "$@"
fi

require_embedding_failures_migration

echo "📦 [Entrypoint] Running initial data bootstrap..."
if node --run update-data; then
    echo "✅ [Entrypoint] Initial data bootstrap completed"
else
    echo "❌ [Entrypoint] Initial data bootstrap failed; scheduler will not start" >&2
    exit 1
fi

echo "♻️  [Entrypoint] Revalidating web caches after bootstrap..."
if node --run scheduler -- --revalidate-bootstrap-caches; then
    echo "✅ [Entrypoint] Bootstrap web-cache revalidation completed"
else
    echo "❌ [Entrypoint] Bootstrap web-cache revalidation failed; scheduler will not start" >&2
    exit 1
fi

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

echo "🕒 [Entrypoint] Starting scheduler..."

# Execute the command passed to the entrypoint (CMD in Dockerfile),
# e.g. ["node", "--run", "scheduler"]. exec makes the scheduler PID 1 so it
# receives SIGTERM directly for graceful shutdown.
exec "$@"
