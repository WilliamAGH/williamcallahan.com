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
    local is_critical="${3:-true}" # Default to critical, pass 'false' for non-critical checks

    echo "📡 Checking connectivity to ${service_name}..."
    if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${url}" | grep -q -E '^[23]'; then
        echo "✅ ${service_name} connectivity check passed"
        return 0
    else
        # Improved logging for failure
        if [ "$is_critical" = true ]; then
            echo "❌ CRITICAL: ${service_name} connectivity check failed. Halting build. Check network/DNS configuration and ensure firewall allows outbound connections to ${url}."
            return 1 # Return error for critical checks
        else
            # Use yellow color for warning if possible (optional, depends on terminal support)
            echo -e "\033[1;33m⚠️ WARNING: ${service_name} connectivity check failed. Continuing build, but ${service_name} features might be affected. URL: ${url}\033[0m"
            return 0 # Return success for non-critical checks to prevent build failure
        fi
    fi
}

# Step 1: Check GitHub API connectivity
check_connectivity "GitHub API" "https://api.github.com/zen" || exit 1

# Step 2: Populate data volumes
echo "🚀 Populating data volumes..."
bun scripts/populate-volumes.ts

# Step 3: Check GitHub API connectivity again
check_connectivity "GitHub API" "https://api.github.com/zen" || exit 1

# Step 4: Check Sentry connectivity (passing 'false' to indicate non-critical)
# Using the project-specific API path derived from the DSN for a more targeted check
check_connectivity "Sentry" "https://o4509274058391557.ingest.us.sentry.io/api/4509274059309056/" false

echo "✅ All pre-build checks completed successfully"
