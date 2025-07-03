#!/usr/bin/env bash
# fix-s3-acl-public.sh – Make every S3 object in the configured bucket publicly readable (ACL = public-read)
# Usage:
#   source .env            # or .env.local / .env.development
#   bash scripts/fix-s3-acl-public.sh
#
# Requirements:
# • AWS CLI v2 with credentials configured via env-vars (AWS_ACCESS_KEY_ID etc.)
# • The following vars must be present in the environment or .env file:
#     S3_BUCKET        – bucket name (e.g. "williamcallahan-com")
#     AWS_REGION       – region (falls back to S3_REGION or "us-east-1")
#
# The script is idempotent: re-running it merely re-applies the same ACL.
# Hidden keys (those starting with a dot) are skipped.
set -euo pipefail

# ---- Dependency Checks ----
command -v aws >/dev/null 2>&1 || { echo "[ACL-Fix] Error: aws CLI not found in PATH." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "[ACL-Fix] Error: jq is required but not found in PATH." >&2; exit 1; }

# Automatically load environment variables from a local .env file if it exists so
# the caller can simply execute the script without manually `source`-ing first.
if [[ -f ".env" ]]; then
  # Export all variables defined in .env into the environment for child processes
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
  echo "[ACL-Fix] Loaded variables from .env"
fi

: "${S3_BUCKET:?S3_BUCKET is not set}"
# ---------------------------- Region determination ---------------------------
# DigitalOcean Spaces and most S3-compatible vendors require requests to be
# signed with **us-east-1**, regardless of the datacenter slug in the endpoint.
# Using the region slug (e.g. "sfo3") frequently triggers SignatureDoesNotMatch
# or AuthorizationHeaderMalformed errors.

if [[ -n "${S3_SERVER_URL:-}" ]]; then
  # For custom S3 endpoints (like DigitalOcean Spaces), force us-east-1 unless
  # the user explicitly overrides with FORCE_AWS_REGION
  if [[ -n "${FORCE_AWS_REGION:-}" ]]; then
    AWS_REGION="${FORCE_AWS_REGION}"
    echo "[ACL-Fix] Using forced region: ${AWS_REGION}"
  else
    # FORCEFULLY override any AWS_REGION from .env for DigitalOcean Spaces compatibility
    export AWS_REGION="us-east-1"
    unset S3_REGION  # Also clear S3_REGION to prevent conflicts
    echo "[ACL-Fix] Using us-east-1 for S3-compatible endpoint (override with FORCE_AWS_REGION if needed)"
  fi
else
  # Standard AWS S3 - use provided region or default
  AWS_REGION="${AWS_REGION:-${S3_REGION:-us-east-1}}"
fi
export AWS_REGION

# ---------------------------------------------------------------------------
# DigitalOcean Spaces signing region
# ---------------------------------------------------------------------------
# Most S3-compatible vendors (including DigitalOcean) expect requests to be
# signed with **us-east-1**, regardless of the datacenter slug in the endpoint.
# Using the region slug (e.g. "sfo3") frequently triggers
# SignatureDoesNotMatch/AuthorizationHeaderMalformed errors.  Unless the caller
# explicitly sets AWS_REGION, default to "us-east-1" whenever a custom
# S3_SERVER_URL is present.

if [[ -n "${S3_SERVER_URL:-}" ]]; then
  AWS_REGION="${AWS_REGION:-us-east-1}"
fi

# When using S3-compatible storage (e.g. DigitalOcean Spaces) the AWS CLI needs
# the explicit endpoint URL.  Detect S3_SERVER_URL from the env (as defined in
# .env-example) and apply it automatically to every AWS CLI invocation.
ENDPOINT_URL="${S3_SERVER_URL:-}" # e.g. https://sfo3.digitaloceanspaces.com
CLI_ARGS=()
if [[ -n "${ENDPOINT_URL}" ]]; then
  CLI_ARGS+=("--endpoint-url" "${ENDPOINT_URL}")
  echo "[ACL-Fix] Using custom S3 endpoint ${ENDPOINT_URL}"
fi

# Global AWS CLI flags – applied to every invocation.
# We **always** force JSON output so that subsequent `jq` parsing never
# encounters non-JSON input when a user's AWS CLI default output format is
# something else (text, yaml, etc.).  This is critical because `set -euo
# pipefail` will abort the script the moment `jq` receives invalid data.
AWS_GLOBAL_FLAGS=("--no-cli-pager" "--output" "json")

# Export AWS_* credentials when only S3_* vars are present – DigitalOcean Spaces
if [[ -z "${AWS_ACCESS_KEY_ID:-}" && -n "${S3_ACCESS_KEY_ID:-}" ]]; then
  export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}"
fi
if [[ -z "${AWS_SECRET_ACCESS_KEY:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
fi
# Warn if credentials are still missing – prevents cryptic AWS CLI failures
if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "[ACL-Fix] ERROR: Neither AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY nor S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are set." >&2
  echo "         Please export valid credentials for the target Spaces bucket before running this script." >&2
  exit 1
fi
# Always pass an explicit --region flag to aws to avoid SDK fallback warnings
CLI_REGION_FLAG=("--region" "${AWS_REGION}")
# Append region flag to CLI_ARGS (avoids breaking existing endpoint handling)
CLI_ARGS+=("${CLI_REGION_FLAG[@]}")

echo "[ACL-Fix] Scanning bucket \"${S3_BUCKET}\" (region: ${AWS_REGION}) …"

# Verify the region is actually set correctly
echo "[ACL-Fix] Final AWS_REGION verification: ${AWS_REGION}"
echo "[ACL-Fix] Command preview: aws --endpoint-url ${S3_SERVER_URL:-default} --region ${AWS_REGION} --output json --no-cli-pager s3api list-objects-v2 --bucket ${S3_BUCKET}"

# ------------------------------- Debug mode ---------------------------------
# Enable verbose xtrace output when either:
#   1. DEBUG env-var is set (e.g. `DEBUG=1 bun run fix:s3-acl-public`)
#   2. --debug flag is supplied as the first CLI argument

if [[ "${1:-}" == "--debug" ]]; then
  DEBUG=1
  shift # remove flag so positional args (if any) remain consistent
fi

if [[ -n "${DEBUG:-}" ]]; then
  # PS4 prefix prints the source file + line + function and exit status
  export PS4='+ ${BASH_SOURCE}:${LINENO}: ${FUNCNAME[0]:-main}() – exit=$? '
  set -x
  echo "[ACL-Fix] Debug mode enabled (set -x)"
  # Also show the exact AWS CLI command being executed
  echo "[ACL-Fix] AWS CLI will use: aws ${CLI_ARGS[*]} ${AWS_GLOBAL_FLAGS[*]} s3api list-objects-v2 --bucket ${S3_BUCKET}"
fi

# Print failing line number on errors when not already in xtrace
trap 'echo "[ACL-Fix] ERROR on line ${LINENO}. Exit code $?" >&2' ERR

# ----------------------------- Helper functions -----------------------------

apply_acl() {
  local key="$1"

  # Skip hidden/system objects (incl. macOS metadata)
  if [[ "${key}" == .* ]]; then
    return 1  # Skip, don't count as updated
  fi

  # Temporarily disable ERR trap for ACL operations
  set +e
  aws "${CLI_ARGS[@]}" "${AWS_GLOBAL_FLAGS[@]}" s3api put-object-acl --bucket "${S3_BUCKET}" --key "${key}" --acl public-read >/dev/null 2>&1
  local status=$?
  set -e
  
  if [[ $status -ne 0 ]]; then
    echo "[ACL-Fix] WARN: Failed to set ACL on ${key}" >&2
    return 1  # Failed, don't count as updated
  fi
  
  return 0  # Success, count as updated
}

# ------------------------------- Main routine -------------------------------

total=0
updated=0

# Temporarily disable ERR trap since we're handling AWS CLI errors explicitly
trap - ERR

CONT_TOKEN=""
while true; do
  if [[ -n "${CONT_TOKEN}" ]]; then
    # Capture both stdout and stderr separately for better error diagnosis
    if ! RESP=$(aws "${CLI_ARGS[@]}" "${AWS_GLOBAL_FLAGS[@]}" s3api list-objects-v2 \
      --bucket "${S3_BUCKET}" --continuation-token "${CONT_TOKEN}" 2>&1); then
      STATUS=$?
      echo "[ACL-Fix] ERROR: list-objects-v2 with continuation token failed (exit ${STATUS})" >&2
      echo "[ACL-Fix] Full AWS CLI output:" >&2
      echo "${RESP}" >&2
      echo "[ACL-Fix] Command was: aws ${CLI_ARGS[*]} ${AWS_GLOBAL_FLAGS[*]} s3api list-objects-v2 --bucket ${S3_BUCKET} --continuation-token ${CONT_TOKEN}" >&2
      exit ${STATUS}
    fi
  else
    # Capture both stdout and stderr separately for better error diagnosis
    if ! RESP=$(aws "${CLI_ARGS[@]}" "${AWS_GLOBAL_FLAGS[@]}" s3api list-objects-v2 \
      --bucket "${S3_BUCKET}" 2>&1); then
      STATUS=$?
      echo "[ACL-Fix] ERROR: list-objects-v2 failed (exit ${STATUS})" >&2
      echo "[ACL-Fix] Full AWS CLI output:" >&2
      echo "${RESP}" >&2
      echo "[ACL-Fix] Command was: aws ${CLI_ARGS[*]} ${AWS_GLOBAL_FLAGS[*]} s3api list-objects-v2 --bucket ${S3_BUCKET}" >&2
      exit ${STATUS}
    fi
  fi

  # Debug: Show first few characters of response to verify it's JSON
  if [[ -n "${DEBUG:-}" ]]; then
    echo "[ACL-Fix] AWS response preview: ${RESP:0:100}..." >&2
  fi

  # Validate that the response is valid JSON before passing to jq
  if ! echo "${RESP}" | jq . >/dev/null 2>&1; then
    echo "[ACL-Fix] ERROR: AWS CLI returned invalid JSON. Full response:" >&2
    echo "${RESP}" >&2
    exit 1
  fi

  mapfile -t KEYS < <(echo "${RESP}" | jq -r '.Contents[]?.Key')
  
  echo "[ACL-Fix] Processing ${#KEYS[@]} objects in this batch..."
  # Temporarily disable set -e for arithmetic operations that can return non-zero
  set +e
  for key in "${KEYS[@]}"; do
    total=$((total + 1))
    echo "[ACL-Fix] Processing ($total/${#KEYS[@]}): ${key}"
    if apply_acl "${key}"; then
      updated=$((updated + 1))
      echo "[ACL-Fix] ✓ Updated ACL: ${key}"
    else
      echo "[ACL-Fix] ⚠ Skipped: ${key}"
    fi
  done
  # Re-enable set -e
  set -e

  echo "[ACL-Fix] Batch complete. Processed: ${total}, Updated: ${updated}"
  CONT_TOKEN=$(echo "${RESP}" | jq -r '.NextContinuationToken // empty')
  [[ -z "${CONT_TOKEN}" ]] && break
done

echo "[ACL-Fix] Completed – ${updated}/${total} objects now have ACL=public-read" 