#!/usr/bin/env bash
# Scheduler container entrypoint: database gate, initial data bootstrap,
# one-time sitemap submission, then the scoped cron scheduler as PID 1.
# The web container (scripts/entrypoint.sh) serves traffic only.
set -euo pipefail

# Everything before the final exec runs with this shell as PID 1, for minutes:
# the database gate retries, then the data bootstrap. Bash defers traps until the
# foreground command returns, so every long step is backgrounded and waited on.
# Without this a SIGTERM in that window is dropped until the orchestrator SIGKILLs.
bootstrap_pid=""

abort_bootstrap() {
    echo "🛑 [Entrypoint] SIGTERM received during bootstrap; aborting startup" >&2
    if [ -n "$bootstrap_pid" ]; then
        kill -TERM "$bootstrap_pid" 2>/dev/null || true
        wait "$bootstrap_pid" 2>/dev/null || true
    fi
    exit 143
}
trap abort_bootstrap TERM INT

run_bootstrap_step() {
    "$@" &
    bootstrap_pid=$!
    local status=0
    wait "$bootstrap_pid" || status=$?
    bootstrap_pid=""
    return "$status"
}

# shellcheck source=scripts/entrypoint-db-gate.sh
source /app/scripts/entrypoint-db-gate.sh

rewrite_database_url_for_internal_service
if is_canonical_production_runtime; then
    wait_for_database_readiness
fi

echo "🔑 [Entrypoint] Ensuring cache directory exists..."
mkdir -p /app/cache/s3_data

is_scheduler_command() {
    [ "$#" -eq 4 ] \
        && [ "$1" = "node" ] \
        && [ "$2" = "--import" ] \
        && [ "$3" = "tsx" ] \
        && [ "$4" = "scheduler/scheduler.ts" ]
}

if ! is_scheduler_command "$@"; then
    echo "[Entrypoint] Running one-shot command: $*"
    exec "$@"
fi

require_embedding_failures_migration

echo "📦 [Entrypoint] Running initial data bootstrap..."
if run_bootstrap_step node --run update-data; then
    echo "✅ [Entrypoint] Initial data bootstrap completed"
else
    echo "❌ [Entrypoint] Initial data bootstrap failed; scheduler will not start" >&2
    exit 1
fi

echo "♻️  [Entrypoint] Revalidating web caches after bootstrap..."
if run_bootstrap_step node --run scheduler -- --revalidate-bootstrap-caches; then
    echo "✅ [Entrypoint] Bootstrap web-cache revalidation completed"
else
    echo "❌ [Entrypoint] Bootstrap web-cache revalidation failed; scheduler will not start" >&2
    exit 1
fi

echo "🗺️  [Entrypoint] Submitting sitemap..."
if [ -n "${GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY:-}" ] && [ -n "${GOOGLE_SEARCH_INDEXING_SA_EMAIL:-}" ]; then
    if run_bootstrap_step node --run submit-sitemap; then
        echo "✅ [Entrypoint] Sitemap submission completed"
    else
        echo "⚠️  [Entrypoint] Sitemap submission failed; continuing startup"
    fi
else
    echo "⚠️  [Entrypoint] Missing Google sitemap credentials; skipping submission"
fi

echo "🕒 [Entrypoint] Starting scheduler..."

# Hand PID 1 to the command passed to the entrypoint (CMD in Dockerfile),
# ["node", "--import", "tsx", "scheduler/scheduler.ts"]. Loading the scheduler
# in-process is what makes this work: a `node --run` or `tsx` CLI parent would
# fork the real script and register no handler of its own, and the kernel
# discards signals sent to a PID 1 that still has the default disposition.
# scheduler/scheduler.ts installs the SIGTERM handler that drains in-flight work.
trap - TERM INT
exec "$@"
