#!/bin/sh
set -e

# Seed logos directory from image if it's empty
if [ ! -d "/app/data/images/logos" ] || [ -z "$(ls -A /app/data/images/logos)" ]; then
  echo "Seeding logos volume from image..."
  cp -r /app/.initial-logos/. /app/data/images/logos/
  # Ensure permissions for nextjs user
  chown -R nextjs:nodejs /app/data/images/logos
fi

# Seed github-activity directory from image if it's empty
if [ ! -d "/app/data/github-activity" ] || [ -z "$(ls -A /app/data/github-activity)" ]; then
  echo "Seeding github-activity volume from image..."
  # Create directory if it doesn't exist
  mkdir -p /app/data/github-activity
  # Copy from the staging area in the image
  cp -r /app/.initial-github-activity/. /app/data/github-activity/ 2>/dev/null || echo "No initial github-activity data found, creating empty volume"
  # Ensure permissions for nextjs user
  chown -R nextjs:nodejs /app/data/github-activity
fi

# Seed bookmarks directory from image if it's empty
if [ ! -d "/app/data/bookmarks" ] || [ -z "$(ls -A /app/data/bookmarks)" ]; then
  echo "Seeding bookmarks volume from image..."
  # Create directory if it doesn't exist
  mkdir -p /app/data/bookmarks
  # Copy from the staging area in the image
  cp -r /app/.initial-bookmarks/. /app/data/bookmarks/ 2>/dev/null || echo "No initial bookmarks data found, creating empty volume"
  # Ensure permissions for nextjs user
  chown -R nextjs:nodejs /app/data/bookmarks
fi

# Execute the command passed to the container
exec "$@"