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

## Static Asset Verification

Verify both outcomes after convergence. A rebuild alone is not proof that asset hashes
or CDN contents changed.

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
printf '%s\n' "$ASSET_PATHS" | while read -r asset_path; do
  test "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL$asset_path")" = 200
done
```

Then request one unique missing chunk twice at the identical URL. Both responses must
be `404`, each must omit public and CDN cache directives, and the repeated response
must not have `CF-Cache-Status: HIT` or `Age`.

```bash
MISSING_URL="$BASE_URL/_next/static/chunks/smoke-missing-$(uuidgen | tr '[:upper:]' '[:lower:]').js"
FIRST_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$MISSING_URL")"
SECOND_RESPONSE="$(curl -sS -D - -o /dev/null -w 'status=%{http_code}\n' "$MISSING_URL")"
for response in "$FIRST_RESPONSE" "$SECOND_RESPONSE"; do
  printf '%s\n' "$response" | rg -q '^status=404$'
  ! printf '%s\n' "$response" |
    rg -qi '^(cache-control:.*public|cdn-cache-control:|cloudflare-cdn-cache-control:)'
done
! printf '%s\n' "$SECOND_RESPONSE" | rg -qi '^(cf-cache-status:[[:space:]]*HIT|age:)'
```

`bun run deploy:smoke-test -- https://[domain]` performs the same `/investments`
content and advertised-script assertion plus the negative static-asset assertion
alongside the other production user-path checks.

## Cache Purge

When a prior response incorrectly cached an asset or a negative asset response, purge
the affected URL or deploy cache in Cloudflare after the corrected release is serving.
Use a full purge only when targeted purging cannot cover the stale entries. Purging is
not a substitute for the positive and negative verification above.

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
