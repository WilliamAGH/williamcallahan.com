#!/usr/bin/env bash
set -e # Exit on error for unhandled commands (but not for if/while conditions by default)

echo "[Entrypoint] Starting volume seeding process..."

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

  echo "[Entrypoint - $PNAME] Seeding volume at $TGT_DIR"
  echo "[Entrypoint - $PNAME] Current contents of target $TGT_DIR (volume mount):"
  ls -Al "$TGT_DIR" || echo "[Entrypoint - $PNAME] Target directory $TGT_DIR might not exist yet or ls failed."

  # Check if target is empty or doesn't exist (mkdir -p handles non-existence)
  # The -d check is mostly for sanity; mount should ensure it exists.
  # The ls -A check is key for emptiness.
  if [ ! -d "$TGT_DIR" ] || [ -z "$(ls -A "$TGT_DIR" 2>/dev/null)" ]; then
    echo "[Entrypoint - $PNAME] Target $TGT_DIR is empty or does not appear to exist. Proceeding with seed."

    echo "[Entrypoint - $PNAME] Ensuring target directory exists: $TGT_DIR"
    mkdir -p "$TGT_DIR"

    if [ ! -d "$SRC_DIR" ] || [ -z "$(ls -A "$SRC_DIR" 2>/dev/null)" ]; then
      echo "[Entrypoint - $PNAME] WARNING: Source directory $SRC_DIR (from image) does not exist or is empty. Nothing to seed for $PNAME."
      CP_FAILED=0 # Not a copy failure, just nothing to copy. Considered success for this step.
    else
      echo "[Entrypoint - $PNAME] Contents of source $SRC_DIR (from image):"
      ls -AlR "$SRC_DIR" || echo "[Entrypoint - $PNAME] ls on source $SRC_DIR failed (this is unexpected if dir exists and has content)."

      echo "[Entrypoint - $PNAME] Attempting to copy from $SRC_DIR to $TGT_DIR..."
      if cp -rv "$SRC_DIR"/. "$TGT_DIR"/; then
        echo "[Entrypoint - $PNAME] Copy successful."
        CP_FAILED=0
        echo "[Entrypoint - $PNAME] Contents of $TGT_DIR after copy:"
        ls -AlR "$TGT_DIR"

        echo "[Entrypoint - $PNAME] Attempting to chown contents of $TGT_DIR to nextjs:nodejs..."
        if find "$TGT_DIR" -mindepth 1 -exec chown -v nextjs:nodejs {} +; then
           echo "[Entrypoint - $PNAME] Chown contents successful."
        else
           echo "[Entrypoint - $PNAME] WARNING: Chown contents for $TGT_DIR failed for some items."
        fi
        chown -v nextjs:nodejs "$TGT_DIR" || echo "[Entrypoint - $PNAME] Warning: Could not chown top-level directory $TGT_DIR."
      else
        local exit_code=$?
        echo "[Entrypoint - $PNAME] ERROR: Copy from $SRC_DIR to $TGT_DIR FAILED. Exit code: $exit_code"
        CP_FAILED=1 # Mark copy as failed
      fi
    fi
  else
    echo "[Entrypoint - $PNAME] Target $TGT_DIR is not empty. Skipping seed."
    echo "[Entrypoint - $PNAME] Current non-empty contents of $TGT_DIR:"
    ls -AlR "$TGT_DIR"
    CP_FAILED=0 # Not a failure, already seeded or pre-populated
  fi
  echo "[Entrypoint - $PNAME] ----- Finished $PNAME seeding -----"
  return $CP_FAILED
}

# Seed actual volumes and track critical failures
CRITICAL_SEEDING_FAILED=0

seed_volume "Logos" "/app/.initial-logos" "/app/data/images/logos"
# Failure to copy logos is logged by seed_volume but not treated as critical here.

seed_volume "GitHub Activity" "/app/.initial-github-activity" "/app/data/github-activity"
if [ $? -ne 0 ]; then
  echo "[Entrypoint] CRITICAL ERROR: Seeding GitHub Activity failed due to a copy error."
  CRITICAL_SEEDING_FAILED=1
fi

seed_volume "Bookmarks" "/app/.initial-bookmarks" "/app/data/bookmarks"
if [ $? -ne 0 ]; then
  echo "[Entrypoint] CRITICAL ERROR: Seeding Bookmarks failed due to a copy error."
  CRITICAL_SEEDING_FAILED=1
fi

if [ $CRITICAL_SEEDING_FAILED -ne 0 ]; then
  echo "[Entrypoint] One or more critical data seeding operations experienced a copy failure. Halting container."
  exit 1
fi

echo "[Entrypoint] Volume seeding process complete (or skipped for non-empty volumes / non-critical failures). Executing CMD: $@"
exec "$@"