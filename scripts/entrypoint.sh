#!/usr/bin/env bash
set -e # Exit on error for unhandled commands (but not for if/while conditions by default)

echo "🔄 Starting volume seeding process..."

# Helper function for seeding
# $1: Pretty name for logs (e.g., "Logos")
# $2: Source directory in image (e.g., "/app/.initial-logos")
# $3: Target volume directory in container (e.g., "/app/data/images/logos")
# Returns 0 on success (or if target not empty / source empty), 1 on actual copy failure.
seed_volume() {
  local PNAME="$1"
  local SRC_DIR="$2"
  local TGT_DIR="$3"
  local CP_FAILED=0 # Flag to indicate if copy operation itself failed

  echo "📂 [$PNAME] Seeding volume at $TGT_DIR"

  # Check if target is empty or doesn't exist (mkdir -p handles non-existence)
  # The -d check is mostly for sanity; mount should ensure it exists.
  # The ls -A check is key for emptiness.
  if [ ! -d "$TGT_DIR" ] || [ -z "$(ls -A "$TGT_DIR" 2>/dev/null)" ]; then
    echo "📂 [$PNAME] Target directory is empty or missing. Creating and seeding..."
    mkdir -p "$TGT_DIR"

    if [ ! -d "$SRC_DIR" ] || [ -z "$(ls -A "$SRC_DIR" 2>/dev/null)" ]; then
      echo "⚠️ [$PNAME] Source directory empty or missing. Nothing to seed."
      CP_FAILED=0 # Not a copy failure, just nothing to copy
    else
      if cp -a "$SRC_DIR"/. "$TGT_DIR"/; then
        echo "✅ [$PNAME] Data copied successfully"
        CP_FAILED=0
        # Ownership operations commented out to improve log clarity
        # if find "$TGT_DIR" -mindepth 1 -exec chown nextjs:nodejs {} +; then
        #    echo "[Entrypoint - $PNAME] Chown contents successful."
        # else
        #    echo "[Entrypoint - $PNAME] WARNING: Chown contents for $TGT_DIR failed for some items."
        # fi
        # chown nextjs:nodejs "$TGT_DIR" || echo "[Entrypoint - $PNAME] Warning: Could not chown top-level directory $TGT_DIR."
      else
        echo "❌ [$PNAME] Copy operation failed"
        CP_FAILED=1
      fi
    fi
  else
    echo "ℹ️ [$PNAME] Target not empty. Skipping seed."
    CP_FAILED=0
  fi
  echo "✓ [$PNAME] Seeding complete"
  return $CP_FAILED
}

# Seed actual volumes and track critical failures
CRITICAL_SEEDING_FAILED=0

seed_volume "Logos" "/app/.initial-logos" "/app/data/images/logos"
# Failure to copy logos is logged by seed_volume but not treated as critical here.

seed_volume "GitHub Activity" "/app/.initial-github-activity" "/app/data/github-activity"
[ $? -ne 0 ] && { echo "❌ CRITICAL: GitHub Activity seeding failed"; CRITICAL_SEEDING_FAILED=1; }

seed_volume "Bookmarks" "/app/.initial-bookmarks" "/app/data/bookmarks"
[ $? -ne 0 ] && { echo "❌ CRITICAL: Bookmarks seeding failed"; CRITICAL_SEEDING_FAILED=1; }

if [ $CRITICAL_SEEDING_FAILED -ne 0 ]; then
  echo "❌ Critical seeding failures detected. Halting container."
  exit 1
fi

echo "✅ Volume seeding complete. Starting application..."
exec "$@"