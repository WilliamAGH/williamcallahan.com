#!/bin/sh
set -e

# Seed logos directory from image if it's empty
if [ ! -d "/app/data/images/logos" ] || [ -z "$(ls -A /app/data/images/logos)" ]; then
  echo "Seeding logos volume from image..."
  mkdir -p /app/data/images/logos # Ensure target exists
  cp -a /app/.initial-logos/. /app/data/images/logos/
  # Ensure permissions for nextjs user on the contents
  find /app/data/images/logos -mindepth 1 -exec chown nextjs:nodejs {} + 2>/dev/null || echo "Could not chown contents of /app/data/images/logos, or directory empty."
fi

# Seed github-activity directory from image if it's empty
if [ ! -d "/app/data/github-activity" ] || [ -z "$(ls -A /app/data/github-activity)" ]; then
  echo "Seeding github-activity volume from image..."
  mkdir -p /app/data/github-activity # Ensure target exists
  # Copy from the staging area in the image, attempt to preserve attributes
  cp -a /app/.initial-github-activity/. /app/data/github-activity/ 2>/dev/null || echo "No initial github-activity data found, or cp -a failed."
  # Ensure permissions for nextjs user on the contents
  # This will only apply to successfully copied files/dirs
  find /app/data/github-activity -mindepth 1 -exec chown nextjs:nodejs {} + 2>/dev/null || echo "Could not chown contents of /app/data/github-activity, or directory empty."
fi

# Seed bookmarks directory from image if it's empty
if [ ! -d "/app/data/bookmarks" ] || [ -z "$(ls -A /app/data/bookmarks)" ]; then
  echo "Seeding bookmarks volume from image..."
  mkdir -p /app/data/bookmarks # Ensure target exists
  # Copy from the staging area in the image, attempt to preserve attributes
  cp -a /app/.initial-bookmarks/. /app/data/bookmarks/ 2>/dev/null || echo "No initial bookmarks data found, or cp -a failed."
  # Ensure permissions for nextjs user on the contents
  find /app/data/bookmarks -mindepth 1 -exec chown nextjs:nodejs {} + 2>/dev/null || echo "Could not chown contents of /app/data/bookmarks, or directory empty."
fi

# Execute the command passed to the container
exec "$@"