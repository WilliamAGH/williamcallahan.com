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

Verify both outcomes after convergence. Use a known deployed chunk and a token that
exists only in the intended release; a rebuild alone is not proof that asset hashes or
CDN contents changed.

```bash
curl -fsS "https://[domain]/_next/static/chunks/[known-chunk].js" \
  | grep -F "[unique-release-token]"
```

Then verify the negative path with a unique missing chunk. It must return `404`, omit
`CDN-Cache-Control` and `Cloudflare-CDN-Cache-Control`, and never send a public
`Cache-Control` policy.

```bash
MISSING_CHUNK="smoke-missing-$(uuidgen | tr '[:upper:]' '[:lower:]').js"
curl -sS -D - -o /dev/null "https://[domain]/_next/static/chunks/$MISSING_CHUNK"
```

`bun run deploy:smoke-test -- https://[domain]` performs the same negative-path
assertion alongside the production user-path checks.

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
