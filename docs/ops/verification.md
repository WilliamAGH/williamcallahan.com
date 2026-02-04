---
title: "Deployment Verification"
description: "Cloudflare caching and bundle verification"
---

# Deployment Verification

See `AGENTS.md` ([DEP1]).

## Cloudflare Bundle Verification

Use this snippet to check whether your code change is present in a deployed chunk (replace placeholders):

```bash
curl -s "https://[domain]/_next/static/chunks/[chunk].js" | grep -c "yourUniqueToken"
```

## Cloudflare Cache Purge Options

1. **Purge Everything**: Cloudflare Dashboard -> Caching -> Purge Everything.
2. **Wait for TTL**: Wait for TTL expiration (can be hours).
3. **Rebuild**: Rebuild/deploy to get new hashed chunk names (Next.js outputs versioned chunk filenames).

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
