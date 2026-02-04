# S3 Object Storage Architecture

**Functionality:** `s3-object-storage`

## Purpose

Define how the application reads and writes every artifact (JSON snapshots, manifests, image binaries, lock files) to DigitalOcean Spaces / S3-compatible storage with strict memory, security, and CDN guarantees. This doc explains the storage layout, environment configuration, helper libraries, and operational runbooks that the image-handling stack depends on.

## Storage Layout

All objects live in a single bucket per environment. Paths deliberately encode data category + audience:

```
bucket/
├── images/
│   ├── logos/                      # Deterministic naming (domain + source + hash)
│   │   └── inverted/               # Dark-theme variants
│   ├── logo/legacy/                # Hash-only legacy keys
│   ├── opengraph/                  # OG images persisted by cache/images or OG service
│   ├── assets/karakeep/            # Proxied bookmark assets
│   ├── twitter-media/, social-avatars/...
│   └── other/blog-posts/           # Synced via scripts/sync-blog-cover-images.ts
├── json/
│   ├── bookmarks/, blog/, github-activity/, education/, experience/
│   ├── search/indices/*.json
│   ├── overrides/opengraph/*.json  # Manual OG overrides
│   └── locks/ (distributed locks, refresh markers)
├── manifests/
│   ├── logos.json                  # IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST
│   ├── opengraph.json
│   └── blog-images.json
└── diagnostics/
    ├── rate-limits/jina-store.json
    └── blocklists/logo-domain-blocklist.json
```

Keys are immutable once written (content-hash suffix or deterministic domain hash). Any mutation requires writing a new key and updating the relevant manifest/map.

## Access Layers

| Layer                      | File                                                                                                                  | Highlights                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Low-level SDK wrapper      | `lib/s3/client.ts`, `lib/s3/objects.ts`, `lib/s3/json.ts`, `lib/s3/binary.ts`, `lib/s3/errors.ts`, `lib/s3/config.ts` | Lazily instantiates AWS SDK v3 `S3Client` (forcePathStyle for Spaces), uses SDK retries (`maxAttempts`, `retryMode`), enforces memory limits for streams, strict JSON/binary helpers, canonical error types. |
| Persistence helpers        | `lib/persistence/s3-persistence.ts`                                                                                   | Categorizes writes (PublicAsset, PublicData, PrivateData, Html), sets ACLs, ensures DigitalOcean Spaces compatibility, manages OpenGraph overrides, wraps JSON/binary writes with logging.                   |
| Image-specific persistence | `lib/image-handling/image-s3-utils.ts`                                                                                | Idempotent saves, Karakeep asset handling, `handleStaleImageUrl` triggers, `persistImageToS3` streaming support.                                                                                             |
| Server cache + Next tags   | `lib/data-access/images.server.ts`, `lib/data-access/logos.ts`, `lib/data-access/opengraph.ts`                        | Provide `"use cache"` wrappers, Next cache tags (`cacheLife`, `cacheTag`, `revalidateTag`), and S3 read short-circuiting.                                                                                    |

## Read Strategy

1. **Prefer CDN** – If the request originates from an API responding with a CDN redirect, we never touch S3 on the hot path. `cdn-utils.ts` reconstructs URLs when only `s3Key` is known.
2. **Cached JSON** – `lib/data-access/images.server.ts` wraps `GetObjectCommand` in `"use cache"`, applying cache tags (`image-key-...`).
3. **Binary Reads** – `readBinaryS3` enforces max size and memory health checks; `serveImageFromS3` infers MIME type from extension before returning buffers.

## Write Strategy

- **Deterministic Keys**: `hash-utils.ts` + `generateS3Key` produce predictable names; no overwrites unless `S3_FORCE_WRITE=true` (used only by sync scripts).
- **Streaming**: `lib/services/image-streaming.ts` uses `@aws-sdk/lib-storage Upload` with timeouts and byte monitoring for large downloads; avoids buffering >5 MB in Node.
- **Atomic Locking**: `acquireDistributedLock` writes `locks/*.json` with `If-None-Match: "*"`; stale lock cleanup happens via `cleanupStaleLocks` when tasks crash.
- **Access Control**: All public assets get `x-amz-acl: public-read`; sensitive JSON lives under private prefixes and is never exposed through CDN.
- **Retries**: AWS SDK retry strategy (configured in `lib/s3/client.ts`) is the only retry layer; no custom retry loops.

## Environment Configuration

| Variable                                                         | Purpose                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`                                                      | Base bucket name (per environment).                                                                                                                     |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_SESSION_TOKEN` | Credentials for DigitalOcean Spaces or AWS.                                                                                                             |
| `S3_REGION` / `AWS_REGION`                                       | Region (default `us-east-1`).                                                                                                                           |
| `S3_SERVER_URL`                                                  | Optional for Spaces; required only when constructing or validating direct S3 URLs. Without it, `cdn-utils` skips S3 host checks and returns null/false. |
| `NEXT_PUBLIC_S3_CDN_URL`                                         | Canonical CDN base URL for all S3 assets (both server and client). Captured at build time for React components; also used in route handlers.            |
| `IMAGE_STREAM_THRESHOLD_BYTES`                                   | Optional override of 5 MB streaming trigger.                                                                                                            |
| `LOAD_IMAGE_MANIFESTS_DURING_BUILD`                              | If `true`, instrumentation loads manifests even during `phase-production-build`.                                                                        |
| `DRY_RUN`                                                        | Skip writes (scripts, local testing).                                                                                                                   |
| `DEV_DISABLE_IMAGE_PROCESSING` / `DEV_STREAM_IMAGES_TO_S3`       | Debug flags controlling UnifiedImageService behavior.                                                                                                   |

## Security Controls

1. **Path Normalization** – `sanitizePath` and key validators prevent directory traversal and `..` segments before any S3 command.
2. **Protocol & Host Enforcement** – All writers/readers operate on normalized `https://` URLs; `cdn-utils` avoids AWS defaults by skipping direct S3 URL reconstruction when `S3_SERVER_URL` is missing.
3. **SSRF Protection** – Upper layers validate URLs before calling persistence helpers; this doc inherits those guarantees but never bypasses them (no blind fetches).
4. **Private IP Blocking** – `url-utils` rejects RFC1918/loopback ranges before handing off to persistence.
5. **Consistent ACLs** – Public assets always `public-read`; private JSON never exposed because `cdnBaseUrl` is omitted for their prefixes.
6. **Audit Logging** – `lib/s3/client.ts` logs initial client creation and missing env warnings once per process to keep CI noise actionable.

## Performance Considerations

- **Latency Targets**: CDN redirect (~50 ms) vs direct S3 (~100–200 ms). Route handlers should always redirect when `cdnUrl` exists to stay in the fast lane.
- **Memory Budget**: 50 MB max read, plus `getMemoryHealthMonitor` gate to prevent OOM in tight containers. Streaming pipeline keeps memory under 10 MB per transfer.
- **Parallelism**: `staticGenerationMaxConcurrency` (Next config) caps parallel page builds; storage reads must survive concurrency=2 by default.
- **Throttling**: `FailureTracker` persists blocklists/rate limits via S3 to share state across stateless deployments.

## Ops & Runbooks

| Task                           | Action                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regenerate blog cover mappings | `bun scripts/sync-blog-cover-images.ts` (uploads + map update).                                                                                      |
| Inspect manifests              | Use `bun run dev` logs from `instrumentation-node.ts` or `bun node -e "require('./lib/image-handling/image-manifest-loader').loadImageManifests()"`. |
| Purge an image                 | Delete `images/...` key, run `invalidateImageCache(key)` (Next cache), optionally purge CDN depending on provider.                                   |
| Reset logo blocklist           | Remove `diagnostics/blocklists/logo-domain-blocklist.json` or run helper in REPL (`FailureTracker.clear()`); ensures new domains can retry.          |
| Troubleshoot S3 auth           | Run `bun -e "import('./src/lib/s3/client').then((m) => m.getS3Client())"` and check structured env logs.                                             |
| Disable writes (safety)        | Set `DRY_RUN=true` when running scripts locally; UnifiedImageService honors `isS3ReadOnly()`.                                                        |

## Dependencies & References

- **Image-handling** – Consumes this storage layer; see [`image-handling.md`](./image-handling.md) for domain-level behavior.
- **Unified stack map** – High-level flow resides in [`s3-image-unified-stack.md`](./s3-image-unified-stack.md).
- **Next.js 16 constraints** – `docs/projects/structure/next-js-16-usage.md` defines experimental flags, Cache Components expectations, and outlawed APIs that indirectly impact storage access.

Keep this file current whenever you add a new prefix, manifest, or lock artifact. If an S3 command path is missing documentation here, it is considered unofficial and subject to removal.

## Next.js Integration Notes

- **CDN URLs are the only optimizer inputs.** The React surfaces call `/api/cache/images` with `<Image unoptimized>` while any CDN URLs must still match `images.remotePatterns`, in line with the [Next.js Image Optimization requirements](https://nextjs.org/docs/app/building-your-application/optimizing/images).
- **Proxy endpoints stream, not redirect.** `/api/cache/images` fetches the CDN resource server-side, decodes multi-encoded `url` parameters, and streams the bytes so `_next/image` always sees a 200 response. ([Image Component docs](https://nextjs.org/docs/app/api-reference/components/image#unoptimized))
- **Add hosts to `next.config.ts` before storing assets.** If you introduce a new Spaces endpoint or CDN hostname, update `CALLAHAN_IMAGE_HOSTS` and `images.remotePatterns` at the same time or `_next/image` will throw 400s in production.

Changes to this contract must be mirrored in `image-handling.md`, `s3-image-unified-stack.md`, and `next-js-16-usage.md`.
