#!/usr/bin/env bash
# Scheduler container entrypoint: database gate, one-time sitemap submission,
# background data populator, then the cron scheduler as PID 1.
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

# The populator is idempotent and no-ops when data already exists.
echo "📦 [Entrypoint] Starting background data populator..."
touch /tmp/needs-initial-data-population
npx tsx scheduler/background-data-populator.ts &
echo "✅ [Entrypoint] Background data populator started (PID: $!)"

echo "🕒 [Entrypoint] Starting scheduler..."

# Execute the command passed to the entrypoint (CMD in Dockerfile),
# e.g. ["node", "--run", "scheduler"]. exec makes the scheduler PID 1 so it
# receives SIGTERM directly for graceful shutdown; the populator is short-lived
# and is reaped with the container.
exec "$@"
