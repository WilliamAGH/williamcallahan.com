#!/usr/bin/env bash
# Points one Dokploy application at an exact multi-platform image reference and
# deploys it. Runs only inside .github/workflows/deploy.yml; see
# docs/ops/deployment.md "Multi-platform image pipeline".
#
# Usage: dokploy-deploy-image.sh <image@sha256:digest> [site-url expected-release-id]
# Env:   DOKPLOY_URL, DOKPLOY_API_KEY, DOKPLOY_APPLICATION_ID
set -euo pipefail

image_ref="$1"
site_url="${2:-}"
expected_release_id="${3:-}"
digest_hex="${image_ref##*@sha256:}"
if [[ ! "$digest_hex" =~ ^[a-f0-9]{64}$ ]]; then
  echo "::error::Dokploy deployment requires an exact image digest, got ${image_ref}" >&2
  exit 1
fi

api="${DOKPLOY_URL%/}/api"
dokploy_get() {
  curl -fsS --connect-timeout 10 --max-time 30 -H "x-api-key: ${DOKPLOY_API_KEY}" "${api}/$1"
}
dokploy_post() {
  local response
  if ! response="$(curl -sS --fail-with-body --connect-timeout 10 --max-time 30 -H "x-api-key: ${DOKPLOY_API_KEY}" \
    -H 'content-type: application/json' -X POST --data "$2" "${api}/$1")"; then
    # Only the error message: a full response body can echo application configuration.
    echo "::error::Dokploy $1 failed: $(jq -r '.message // "no message"' <<<"${response}" 2>/dev/null || echo unparsable)" >&2
    return 1
  fi
  printf '%s' "${response}"
}

application="$(dokploy_get "application.one?applicationId=${DOKPLOY_APPLICATION_ID}")"
current_image="$(jq -r '.dockerImage // ""' <<<"${application}")"
current_source="$(jq -r '.sourceType' <<<"${application}")"
labels_swarm="$(jq -c '.labelsSwarm // {}' <<<"${application}")"
# Dokploy resolves ${DOKPLOY_SOURCE_REVISION} only for Git sources and refuses it on an image deploy.
target_labels="$(jq -c --arg sha "${GITHUB_SHA:?}" \
  'with_entries(if .value == "${DOKPLOY_SOURCE_REVISION}" then .value = $sha else . end)' <<<"${labels_swarm}")"
current_auto_deploy="$(jq -r '.autoDeploy' <<<"${application}")"
echo "Dokploy application: sourceType=${current_source} dockerImage=${current_image:-<none>}"

# For an image source Dokploy authenticates Swarm pulls with application-level
# username/password/registryUrl when set and only otherwise with registryId.
# Every node must pull through the attached registry record.
if ! jq -e '.registryId != null and .username == null and .password == null and .registryUrl == null' <<<"${application}" >/dev/null; then
  echo "::error::Dokploy application must pull through registryId with no application-level registry credentials" >&2
  exit 1
fi

# The first run converts a native Git build to an image source and turns off the
# Git push trigger, which would otherwise queue a second deployment per push;
# later runs only swap the digest. expectedDockerImage rejects a concurrent writer.
if [[ "${current_source}" != "docker" || "${current_image}" != "${image_ref}" || "${current_auto_deploy}" != "false" ]]; then
  # Dokploy requires the expected image and labels together, with replacements.
  update_body="$(jq -nc --arg id "${DOKPLOY_APPLICATION_ID}" --arg image "${image_ref}" --arg expected "${current_image}" \
    --argjson labels "${labels_swarm}" --argjson target "${target_labels}" \
    '{applicationId: $id, sourceType: "docker", dockerImage: $image, autoDeploy: false, labelsSwarm: $target}
     + (if $expected == "" then {} else {expectedDockerImage: $expected, expectedLabelsSwarm: $labels} end)')"
  dokploy_post application.update "${update_body}" >/dev/null
fi

deploy_body="$(jq -nc --arg id "${DOKPLOY_APPLICATION_ID}" --arg image "${image_ref}" --arg key "${digest_hex}" \
  --argjson labels "${target_labels}" \
  '{applicationId: $id, expectedDockerImage: $image, expectedLabelsSwarm: $labels, idempotencyKey: $key}')"
deployment_id="$(dokploy_post application.deploy "${deploy_body}" | jq -er '.deploymentId')"
echo "Dokploy deployment ${deployment_id} submitted"

# Dokploy reports `done` only after Swarm's start-first update converges. The
# scheduler's new task turns healthy only after its entrypoint bootstrap (the
# 15-minute HEALTHCHECK start period in scheduler/Dockerfile), followed by the
# 180-second update monitor; those deploys finish at about 16 minutes.
deadline=$((SECONDS + 1500))
while true; do
  status="$(dokploy_get "deployment.all?applicationId=${DOKPLOY_APPLICATION_ID}" |
    jq -r --arg id "${deployment_id}" '.[] | select(.deploymentId == $id) | .status')" || status="unreadable"
  case "${status}" in
    done) break ;;
    error)
      echo "::error::Dokploy deployment ${deployment_id} failed" >&2
      exit 1
      ;;
  esac
  if ((SECONDS >= deadline)); then
    echo "::error::Dokploy deployment ${deployment_id} did not finish in 25 minutes (status=${status:-missing})" >&2
    exit 1
  fi
  sleep 5
done
echo "Dokploy deployment ${deployment_id} done"

[[ -z "${site_url}" ]] && exit 0

# Dokploy records `done` once Docker accepts service.update, before the
# start-first rollout replaces every replica. The site advertises its release
# as `?dpl=<id>`; the rollout has converged once consecutive uncached requests,
# which the load balancer spreads across replicas, all serve the new release.
required_streak=8
streak=0
deadline=$((SECONDS + 900))
while ((streak < required_streak)); do
  served="$(curl -fsS --connect-timeout 10 --max-time 30 -H 'cache-control: no-cache' \
    "${site_url%/}/?release-probe=${expected_release_id}-${SECONDS}" |
    grep -oE 'dpl=[A-Za-z0-9_-]+' | sort -u | tr '\n' ' ' || true)"
  # The RSC flight payload can split a chunk URL at a flush boundary, leaving a
  # truncated `dpl=` token; only a token that is not a prefix of the expected
  # release marks an old replica.
  converged=false
  if [[ " ${served}" == *" dpl=${expected_release_id} "* ]]; then
    converged=true
    for token in ${served}; do
      [[ "${expected_release_id}" == "${token#dpl=}"* ]] || converged=false
    done
  fi
  if [[ "${converged}" == true ]]; then
    streak=$((streak + 1))
  else
    streak=0
  fi
  ((streak >= required_streak)) && break
  if ((SECONDS >= deadline)); then
    echo "::error::${site_url} still serves '${served}', expected dpl=${expected_release_id}" >&2
    exit 1
  fi
  sleep 5
done
echo "${site_url} serves release ${expected_release_id} on ${required_streak} consecutive requests"
