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
