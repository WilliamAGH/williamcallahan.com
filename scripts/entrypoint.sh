#!/bin/sh
set -e

echo "[Entrypoint] Starting volume seeding process..."

# Helper function for seeding
# $1: Pretty name for logs (e.g., "Logos")
# $2: Source directory in image (e.g., "/app/.initial-logos")
# $3: Target volume directory in container (e.g., "/app/data/images/logos")
seed_volume() {
  local PNAME="$1"
  local SRC_DIR="$2"
  local TGT_DIR="$3"

  echo "[Entrypoint - $PNAME] Seeding volume at $TGT_DIR"
  echo "[Entrypoint - $PNAME] Current contents of target $TGT_DIR (volume mount):"
  ls -Al "$TGT_DIR" || echo "[Entrypoint - $PNAME] Target directory $TGT_DIR might not exist yet or ls failed."

  # Check if target is empty or doesn't exist (mkdir -p handles non-existence)
  # The -d check is mostly for sanity; mount should ensure it exists.
  # The ls -A check is key for emptiness.
  if [ ! -d "$TGT_DIR" ] || [ -z "$(ls -A "$TGT_DIR" 2>/dev/null)" ]; then
    echo "[Entrypoint - $PNAME] Target $TGT_DIR is empty or does not exist. Proceeding with seed."

    echo "[Entrypoint - $PNAME] Ensuring target directory exists: $TGT_DIR"
    mkdir -p "$TGT_DIR"

    echo "[Entrypoint - $PNAME] Contents of source $SRC_DIR (from image):"
    ls -AlR "$SRC_DIR" || echo "[Entrypoint - $PNAME] Source directory $SRC_DIR might be empty or ls failed."

    echo "[Entrypoint - $PNAME] Attempting to copy from $SRC_DIR to $TGT_DIR..."
    # Use cp -r. We will chown everything afterwards. Add -v for verbose.
    if cp -rv "$SRC_DIR"/. "$TGT_DIR"/; then
      echo "[Entrypoint - $PNAME] Copy successful."
      echo "[Entrypoint - $PNAME] Contents of $TGT_DIR after copy:"
      ls -AlR "$TGT_DIR"

      echo "[Entrypoint - $PNAME] Attempting to chown contents of $TGT_DIR to nextjs:nodejs..."
      # Chown the contents. The -R on the directory itself was problematic.
      # Using find is more robust for contents.
      if find "$TGT_DIR" -mindepth 1 -exec chown -v nextjs:nodejs {} +; then
         echo "[Entrypoint - $PNAME] Chown contents successful."
      else
         echo "[Entrypoint - $PNAME] WARNING: Chown contents for $TGT_DIR failed for some items."
      fi
      # Also chown the top-level directory itself, if possible (might fail, but contents are more important)
      chown -v nextjs:nodejs "$TGT_DIR" || echo "[Entrypoint - $PNAME] Warning: Could not chown top-level directory $TGT_DIR (this might be okay if contents were chowned)."

    else
      echo "[Entrypoint - $PNAME] ERROR: Copy from $SRC_DIR to $TGT_DIR FAILED. Exit code: $?"
    fi
  else
    echo "[Entrypoint - $PNAME] Target $TGT_DIR is not empty. Skipping seed."
    echo "[Entrypoint - $PNAME] Current non-empty contents of $TGT_DIR:"
    ls -AlR "$TGT_DIR"
  fi
  echo "[Entrypoint - $PNAME] ----- Finished $PNAME seeding -----"
}

# Seed actual volumes based on Dockerfile VOLUME declarations and Coolify mounts
seed_volume "Logos" "/app/.initial-logos" "/app/data/images/logos" # Corrected target
seed_volume "GitHub Activity" "/app/.initial-github-activity" "/app/data/github-activity"
seed_volume "Bookmarks" "/app/.initial-bookmarks" "/app/data/bookmarks"

echo "[Entrypoint] Volume seeding process complete. Executing CMD: $@"
exec "$@"