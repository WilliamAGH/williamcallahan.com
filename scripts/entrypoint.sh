#!/usr/bin/env bash
# Web container entrypoint: database gate, then the Next.js server.
# Background data work (scheduler, populator, sitemap submission) runs in the
# dedicated scheduler container — see scheduler/entrypoint.sh.
set -euo pipefail

# shellcheck source=scripts/entrypoint-db-gate.sh
source /app/scripts/entrypoint-db-gate.sh

rewrite_database_url_for_internal_service
if is_canonical_production_runtime; then
    wait_for_database_readiness
fi

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
mkdir -p /app/cache/s3_data
echo "✅ [Entrypoint] Cache directory /app/cache/s3_data ensured."

echo "🚀 [Entrypoint] Starting main application..."

# Execute the command passed to the entrypoint (CMD in Dockerfile),
# e.g. ["node", "--run", "start"]. Runs as non-root user 'nextjs' (UID 1001).
exec "$@"
