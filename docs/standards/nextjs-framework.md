# Next.js 16 Usage Architecture

**Functionality:** `next-js-16-usage`

## Contract and Version Evidence

This is the operational contract for framework work in this repository. Verify a
claim against the installed source and current framework documentation before changing
application behavior; do not infer behavior from a major-version label.

| Concern                 | Canonical evidence                                    | Current contract |
| ----------------------- | ----------------------------------------------------- | ---------------- |
| Next.js                 | `package.json`, `node_modules/next/package.json`      | 16.1.6           |
| React                   | `package.json`, `node_modules/react/package.json`     | 19.2.4           |
| Vitest                  | `package.json`, `node_modules/vitest/package.json`    | 4.1.2            |
| Node package floor      | `node_modules/next/package.json`                      | `>=20.9.0`       |
| Container Node manifest | `package.json` (`engines.node`, `runtime.node.linux`) | exactly 24.18.0  |

`package.json` owns the exact Node version and Linux artifact checksums. Both Dockerfiles
parse that manifest with `jq`; `docs/ops/deployment.md` owns the operational procedure.

## Required Sources Before a Framework Change

- `node_modules/next/dist/server/config.js` for configuration behavior, including
  `cacheComponents`, removed `experimental.ppr`, and `skipProxyUrlNormalize`.
- `node_modules/next/dist/server/request/params.js` for async `params` behavior.
- `node_modules/next/dist/shared/lib/image-config.js` for image defaults.
- `node_modules/next/dist/server/node-environment-extensions/{date,utils}.js` for
  current-time behavior during prerendering.
- `docs/standards/testing.md` and `config/vitest/` before changing test setup.
- `docs/standards/react-patterns.md` before moving a Server/Client boundary.
- The applicable Next.js 16 documentation through Context7 or the official Next.js
  documentation. Record the query and the installed-source location in the change.

## Production Node Runtime and the TransformStream Incident

Both container images project exactly Node.js 24.18.0 from `package.json`'s
`engines.node`. The operational runtime contract, the TransformStream incident rationale,
and the image verification commands are owned by
[`docs/ops/deployment.md#node-runtime`](../ops/deployment.md#node-runtime).
Keep the repair at that runtime owner: do not substitute a floating NodeSource channel,
a runtime retry, or a polyfill in application code.

## Next.js 15 and 16 Contracts

### Migration Rules

| Area                | Required behavior                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic APIs        | Treat `params`, `searchParams`, `cookies()`, and `headers()` as asynchronous. Await them in Server Components; use React's supported promise APIs in Client Components. |
| Cache Components    | Keep `cacheComponents: true` in `next.config.ts`. Use `'use cache'` for cacheable work and stable `cacheLife`/`cacheTag` APIs inside valid cache scopes.                |
| Route config        | Do not export `runtime`, `dynamicParams`, `dynamic`, `fetchCache`, `revalidate`, or `experimental_ppr` from an App Router segment while Cache Components are enabled.   |
| Removed experiments | Do not reintroduce `experimental.ppr` or `experimental.dynamicIO`; PPR is configured through `cacheComponents`.                                                         |
| Proxy naming        | Use `skipProxyUrlNormalize`, never `skipMiddlewareUrlNormalize`. Next 16 uses `src/proxy.ts`, not `middleware.ts`.                                                      |
| Images              | Use `next/image`; `next/legacy/image` is prohibited.                                                                                                                    |
| Tooling             | Turbopack is the Next 16 default. Do not add redundant flags or revive a Webpack configuration without an approved, measured reason.                                    |
| Deployment identity | Production assets must carry one release-scoped `?dpl=` value. The same `GIT_SHA` intentionally reuses it; purge or a new source revision recovers a same-SHA cache incident. |

Installed-source evidence: `node_modules/next/dist/server/config.js:330-331` rejects
`experimental.ppr`; lines 1029-1041 connect Cache Components to PPR and `use cache`.
The Next 16 transform rejects route segment configurations while Cache Components are
enabled. Verify this against the installed version before changing a segment.

Installed Next 16.1.6 reads `NEXT_DEPLOYMENT_ID` in
`node_modules/next/dist/server/config.js` and appends it through
`node_modules/next/dist/shared/lib/deployment-id.js`. `generateBuildId` is separate and
does not version static asset URLs by itself. Docker binds it through `GIT_HASH` and binds
`NEXT_DEPLOYMENT_ID` to the same value for `dpl` URLs. A same `GIT_SHA` intentionally reuses
that value; follow the purge-or-new-revision recovery procedure in `docs/ops/deployment.md`.

### Async Request Data

- Await `params` and `searchParams` before property access or destructuring in every
  page, layout, metadata generator, sitemap, and image route.
- Await `cookies()` and `headers()` in Server Components. Do not preserve synchronous
  wrappers or `UnsafeUnwrapped` compatibility paths.
- Keep metadata, sitemap, and Open Graph handlers async whenever they consume dynamic
  route parameters.
- `node_modules/next/dist/server/request/params.js:406-412` emits the current
  synchronous-access error; use that source rather than guessing a migration shape.

### Cache Components and Rendering

`next.config.ts` is the application configuration owner. Cache components invert the
old route-config workflow: cache explicitly with `'use cache'`; do not use old
page/layout `dynamic` exports or `unstable_noStore()` to force rendering behavior.

- Use `cacheLife` and `cacheTag` from `next/cache` for cacheable data and preserve the
  existing tag owner. Do not add local tag catalogs or unstable aliases.
- Coordinate a backend read's cache owner, invalidation event, and revalidation tag
  before changing a page, metadata path, or route handler that consumes it.
- Do not use `cache: "no-store"` or `revalidate: 0` in a statically prerendered path;
  that creates static-to-dynamic failures. Put request-time work outside cache scopes.
- Do not use `connection()` in a page or layout as a rendering escape hatch. A Route
  Handler may use it only when request-time execution is its explicit contract.
- Keep bookmark and sitemap reads bounded. Do not reintroduce build-phase
  `NEXT_PHASE` guards that remove sitemap sections or production/build local fallbacks.

### Time and Build-Phase Values

Next tracks current-time access during prerendering. `Date.now()`, `Date()`, and
`new Date()` must not run before uncached data or request data in a Server Component.
For diagnostics use `performance.timeOrigin + performance.now()`; for output either
read request data first, move the value to a Client Component with Suspense, or place
the cacheable value inside a cache scope. This behavior is implemented in
`node_modules/next/dist/server/node-environment-extensions/{date,utils}.js`.

Do not read `process.env.NEXT_PHASE` directly in route-output logic: the bundler can
inline it. Use the repository's existing bracket-key pattern and keep such checks out
of module-scope output decisions.

## Build and Test Runtime

Next builds must run on the pinned Node runtime. Bun may orchestrate package scripts,
but the Next CLI remains `node ./node_modules/next/dist/bin/next`; do not run the
Next build on Bun or add a compatibility layer for timer behavior.

Before changing framework behavior:

1. Inspect the installed Next, React, and Vitest sources that prove the claim.
2. Fetch current official framework guidance through Context7 or the official docs.
3. Map every affected route, metadata builder, test, and cache/invalidation consumer.
4. Run `bun run validate`, then the smallest relevant `bun run test` command.
5. Run `NODE_ENV=production bun run build` for build or rendering changes.

Do not run `bun test` directly: it bypasses `config/vitest/`. Do not add polyfills,
global patches, or downgraded packages to conceal a Node or framework incompatibility.

## Image Optimization Contract

The canonical inventory, decision matrix, helpers, and detection commands live only in
[`docs/architecture/image-handling.md`](../architecture/image-handling.md#image-optimization-decision-matrix).
Bind framework work to that owner and verify any proposed Next.js default change against
the installed source before editing configuration or components.

## Link Prefetch Contract

Keep normal navigation on the framework default. Set `prefetch={false}` for high-volume
lists, grids, tag clouds, cards, and secondary navigation where viewport prefetch would
otherwise create unnecessary request volume. Do not disable it for primary navigation
without measured evidence.

## Prohibited Patterns

- `next/legacy/image`, `experimental.ppr`, `experimental.dynamicIO`, or obsolete
  `unstable_cache*` names.
- Synchronous access to a dynamic API or a compatibility wrapper that makes it look
  synchronous.
- Page/layout `dynamic` exports, `unstable_noStore()`, or `connection()` used as a
  Cache Components workaround.
- Direct `NEXT_PHASE` output guards, unbounded sitemap/tag scans, or local production
  fallbacks for S3-backed data.
- `cache: "no-store"` or `revalidate: 0` in a static route.
- Runtime retries, shims, polyfills, or package downgrades that hide a Node runtime bug.
- React 18-era rendering APIs or legacy metadata helpers.

## Verification and Deployment Handoff

Framework changes need an evidence trail containing the installed-source path and the
official documentation lookup. Use these gates in order:

```bash
bun run validate
bun run test -- <focused test selector>
NODE_ENV=production bun run build
bun run deploy:verify
```

For a web runtime update, also build the web image and inspect its node version as
specified in `docs/ops/deployment.md`. After deployment, verify the public bundle
contains the change when the task affects client assets; Cloudflare caching can otherwise
make a passing local build look undeployed.
