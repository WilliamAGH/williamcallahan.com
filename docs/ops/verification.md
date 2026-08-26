---
title: "Deployment Verification"
description: "Cloudflare caching and bundle verification"
---

# Deployment Verification

See `AGENTS.md` ([DEP1]).

## Deployment Convergence

A successful build does not prove that every origin or CDN edge serves its output.
After deployment, wait for the rollout to converge and sample the affected route at
least five times. Do not continue while responses alternate between old and new
behavior.

```bash
for _ in {1..5}; do
  curl -fsS -o /dev/null -w "%{http_code}\n" "https://[domain]/[affected-route]"
  sleep 2
done
```

## Blog Render Production Smoke and Focused Dogfood

After the rollout has converged, run the existing production smoke command:

```bash
bun run deploy:smoke-test -- <base-url> [auth-token] [--expected-release-id=<id>]
```

`scripts/smoke-test-production.ts` imports the two canonical entries from
`config/blog-render-canaries.ts` and delegates their HTML checks to
`scripts/blog-render-smoke.ts`. The smoke check requires one `article.blog-content`,
the exact article title, non-empty content, ordered canonical markers, and no visible
MDX-render fallback. Do not add a separate production canary list.

After that command passes, dogfood those same two routes in a production Chromium
browser: confirm the title and body markers, confirm the loading and MDX fallback
messages are absent, open every declared article interaction, and inspect for browser
page errors or failed same-origin requests. This manual browser pass complements the
HTML-only production smoke check; it does not replace it.

## Advertised JavaScript Verification

Verify advertised JavaScript after convergence. A rebuild alone is not proof that bundle
hashes or CDN contents changed. This procedure and `scripts/smoke-test-production.ts` inspect
JavaScript only; they do not verify CSS assets.

```bash
BASE_URL="https://[domain]"
ROUTE="/investments"
HTML="$(curl -fsS "$BASE_URL$ROUTE")"
printf '%s' "$HTML" | rg -q 'Investment Portfolio'
ASSET_PATHS="$(printf '%s' "$HTML" |
  rg -o 'src="/_next/static/[^"]+\.js[^"]*"' |
  cut -d '"' -f 2 |
  sort -u)"
test -n "$ASSET_PATHS"
DEPLOYMENT_IDS="$(printf '%s\n' "$ASSET_PATHS" |
  sed -n 's/.*[?&]dpl=\([^&]*\).*/\1/p' |
  sort -u)"
test "$(printf '%s\n' "$DEPLOYMENT_IDS" | sed '/^$/d' | wc -l | tr -d ' ')" = 1
test "$(printf '%s\n' "$ASSET_PATHS" | wc -l | tr -d ' ')" = \
  "$(printf '%s\n' "$ASSET_PATHS" | rg -c '[?&]dpl=[^&]+')"
printf '%s\n' "$ASSET_PATHS" | while read -r asset_path; do
  test "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL$asset_path")" = 200
done
```

Then request one unique missing chunk twice at the identical URL and one cache-busted
same-origin analytics tracker URL twice. The origin/proxy response must have `Cache-Control`
containing `no-store`; `CDN-Cache-Control` and `Cloudflare-CDN-Cache-Control` may be absent,
but each must contain `no-store` when emitted. Independently, neither response may report
`CF-Cache-Status: HIT` or an `Age` header. Cloudflare's `status_code_ttl: -1` rule prevents
edge storage of failed static chunks; it does not mutate their origin response headers. The
missing chunk must be `404`; the analytics tracker must be `200`.

`src/proxy.ts` returns `/stats/**` directly after fetching the fixed Umami origin. Do not replace
that response with an external Next.js rewrite: Next 16 applies proxy headers before forwarding,
then the upstream response can overwrite the browser `Cache-Control` field.

```bash
set -euo pipefail

assert_no_store_response() {
  local response="$1"
  local expected_status="$2"

  printf '%s\n' "$response" | rg -q "^status=${expected_status}$"
  printf '%s\n' "$response" | rg -qi '^cache-control:.*no-store'
  for cache_header in cdn-cache-control cloudflare-cdn-cache-control; do
    if printf '%s\n' "$response" | rg -qi "^${cache_header}:"; then
      printf '%s\n' "$response" | rg -qi "^${cache_header}:.*no-store"
    fi
  done
  ! printf '%s\n' "$response" | rg -qi '^(cf-cache-status:[[:space:]]*HIT|age:)'
}

MISSING_URL="$BASE_URL/_next/static/chunks/smoke-missing-$(uuidgen | tr '[:upper:]' '[:lower:]').js"
FIRST_MISSING_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$MISSING_URL")"
SECOND_MISSING_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$MISSING_URL")"
for response in "$FIRST_MISSING_RESPONSE" "$SECOND_MISSING_RESPONSE"; do
  assert_no_store_response "$response" 404
done

ANALYTICS_URL="$BASE_URL/stats/script.js?smoke=$(uuidgen | tr '[:upper:]' '[:lower:]')"
FIRST_ANALYTICS_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$ANALYTICS_URL")"
SECOND_ANALYTICS_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$ANALYTICS_URL")"
for response in "$FIRST_ANALYTICS_RESPONSE" "$SECOND_ANALYTICS_RESPONSE"; do
  assert_no_store_response "$response" 200
done
```

The production smoke command also performs the `/investments` content and advertised-script
assertion plus the missing-static-chunk and analytics-script cache assertions alongside the
other production user-path checks.

For a Cache Rules change, preview the declarative
`infra/cloudflare/cache-rules.json` configuration before deployment, then apply it only after
reviewing the diff:

```bash
bun run deploy:cf-cache-rules:dry-run
bun run deploy:cf-cache-rules
```

The commands require `CF_ZONE_ID` and the preferred `CF_API_TOKEN`; the global-key fallback
requires both `CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL`.

When a release adds origin cacheable headers to paths newly covered by a cache rule's
`status_code_ttl` guard (for example the public static asset rule), apply the cache rules
before or with the app release. In the gap after an app-first release, error responses for
those paths still carry the origin's `CDN-Cache-Control`, so Cloudflare may edge-store a
missing-asset `404` until the guard rule exists.

## Cache Purge

When a prior response incorrectly cached an asset or a negative asset response, purge
the affected URL or deploy cache in Cloudflare after the corrected release is serving.
Use a full purge only when targeted purging cannot cover the stale entries. Purging is
not a substitute for the positive and negative verification above.

For immediate diagnosis, appending a fresh URL-safe `?dpl=<diagnostic-id>` to an asset request
selects a new Cloudflare cache key under this zone's default query-string policy. A successful
response proves the origin has the asset, but it does not evict the poisoned object or change
the Docker-owned deployment identity. A same-source-revision rebuild deliberately retains its
`dpl` value, so recovery requires a Cloudflare exact-URL/deployment purge or a new source
revision.

## Baseline Browser Mapping Warning

The `[baseline-browser-mapping] The data in this module is over two months old` warning comes from the
`baseline-browser-mapping` package bundled with `browserslist`. The dataset is embedded in the package
and only updates when the dependency version changes.

### How to upgrade

1. Check the pinned version in `package.json` overrides (`baseline-browser-mapping`).
2. Check the latest registry version:
   - `npm_config_cache=/tmp/npm-cache npm view baseline-browser-mapping version`
3. If newer, update the override version in `package.json`, then run:
   - `bun install`

### Current suppression

Build scripts set `BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA=true` to suppress the warning during builds.
Remove that env var if you want the warning to surface again.
