#!/usr/bin/env bash
set -e

# Check if running in a Coolify environment
if [ -n "$COOLIFY_FQDN" ] || \
   [ -n "$COOLIFY_URL" ] || \
   [ -n "$COOLIFY_BRANCH" ] || \
   [ -n "$COOLIFY_RESOURCE_UUID" ] || \
   [ -n "$COOLIFY_CONTAINER_NAME" ]; then
    echo "🔍 Coolify environment detected. Skipping pre-build checks."
    exit 0
fi

echo "🔍 Running pre-build checks..."

# Function to check connectivity with reduced verbosity
check_connectivity() {
    local service_name="$1"
    local url="$2"

    echo "📡 Checking connectivity to ${service_name}..."
    if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${url}" | grep -q -E '^[23]'; then
        echo "✅ ${service_name} connectivity check passed"
        return 0
    else
        echo "❌ ${service_name} connectivity check failed. Check network/DNS configuration and ensure your firewall allows outbound connections to ${url}."
        return 1
    fi
}

# Step 1: Check GitHub API connectivity
check_connectivity "GitHub API" "https://api.github.com/zen" || exit 1

# Step 2: Populate data volumes
echo "🚀 Populating data volumes..."
bun scripts/populate-volumes.ts

# Step 3: Check GitHub API connectivity again
check_connectivity "GitHub API" "https://api.github.com/zen" || exit 1

# Step 4: Check Sentry connectivity
check_connectivity "Sentry" "https://o4509274058391557.ingest.us.sentry.io" || exit 1

echo "✅ All pre-build checks completed successfully"
