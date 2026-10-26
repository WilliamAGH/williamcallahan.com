# Next.js 16 Usage Architecture

**Functionality:** `next-js-16-usage`

## Contract and Version Evidence

Priority navigation links use Next.js automatic prefetch (`null`), not full
prefetch (`true`), so optional dynamic content does not block prefetch validation.

This is the operational contract for framework work in this repository. Verify a
claim against the installed source and current framework documentation before changing
application behavior; do not infer behavior from a major-version label.

| Concern                 | Canonical evidence                                     | Current contract |
| ----------------------- | ------------------------------------------------------ | ---------------- |
| Next.js                 | `package.json`, `node_modules/next/package.json`       | 16.4.2           |
| React                   | `package.json`, `node_modules/react/package.json`      | 19.2.4           |
| Vitest                  | `package.json`, `node_modules/vitest/package.json`     | 4.1.2            |
| next-mdx-remote         | `package.json`, `node_modules/next-mdx-remote`         | 6.0.0            |
| remark-gfm              | `package.json`, `node_modules/remark-gfm/package.json` | 4.0.1            |
| Node package floor      | `node_modules/next/package.json`                       | `>=20.9.0`       |
| Container Node manifest | `package.json` (`engines.node`, `runtime.node.linux`)  | exactly 24.22.1  |

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
- `config/playwright.config.ts`, `e2e/blog-render.spec.ts`, and
  `config/blog-render-canaries.ts` before changing an async blog route or MDX render
  boundary.
- `docs/standards/react-patterns.md` before moving a Server/Client boundary.
- The applicable Next.js 16 documentation through Context7 or the official Next.js
  documentation. Record the query and the installed-source location in the change.

## Production Node Runtime and the TransformStream Incident

Both container images project exactly Node.js 24.22.1 from `package.json`'s
`engines.node`. The operational runtime contract, the TransformStream incident rationale,
and the image verification commands are owned by
[`docs/ops/deployment.md#node-runtime`](../ops/deployment.md#node-runtime).
Keep the repair at that runtime owner: do not substitute a floating NodeSource channel,
a runtime retry, or a polyfill in application code.

## Next.js 15 and 16 Contracts

### Migration Rules

| Area                | Required behavior                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic APIs        | Treat `params`, `searchParams`, `cookies()`, and `headers()` as asynchronous. Await them in Server Components; use React's supported promise APIs in Client Components.                                                                              |
| Cache Components    | Keep `cacheComponents: true` in `next.config.ts`. Use `'use cache'` for cacheable work and stable `cacheLife`/`cacheTag` APIs inside valid cache scopes.                                                                                             |
| Route config        | Do not export `runtime`, `dynamicParams`, `dynamic`, `fetchCache`, `revalidate`, or `experimental_ppr` from an App Router segment while Cache Components are enabled.                                                                                |
| Removed experiments | Do not reintroduce `experimental.ppr` or `experimental.dynamicIO`; PPR is configured through `cacheComponents`.                                                                                                                                      |
| Proxy naming        | Use `skipProxyUrlNormalize`, never `skipMiddlewareUrlNormalize`. Next 16 uses `src/proxy.ts`, not `middleware.ts`.                                                                                                                                   |
| Images              | Use `next/image`; `next/legacy/image` is prohibited.                                                                                                                                                                                                 |
| Tooling             | Turbopack is the Next 16 default. Do not add redundant flags or revive a Webpack configuration without an approved, measured reason.                                                                                                                 |
| Deployment identity | Production assets must carry one release-scoped `?dpl=` value; the Git-free runner reads `.next/RELEASE_ID`, written by the image build. Never fall back to `.next/BUILD_ID`. See [Web Release Identity](../ops/deployment.md#web-release-identity). |

Installed-source evidence: `node_modules/next/dist/server/config.js:330-331` rejects
`experimental.ppr`; lines 1029-1041 connect Cache Components to PPR and `use cache`.
The Next 16 transform rejects route segment configurations while Cache Components are
enabled. Verify this against the installed version before changing a segment.

Installed Next 16.1.6 reads `NEXT_DEPLOYMENT_ID` in
`node_modules/next/dist/server/config.js` and appends it through
`node_modules/next/dist/shared/lib/deployment-id.js`. `generateBuildId` is separate and
does not version static asset URLs by itself. `NEXT_DEPLOYMENT_ID` is the canonical input:
`next.config.ts` resolves the release identity and sets `process.env.NEXT_DEPLOYMENT_ID`; it
does not declare a `deploymentId` configuration property. Next derives its configuration
deployment ID from that environment value, while `generateBuildId` returns the same release
identity. The Docker source-selection and exact-revision proof contract is owned by
[`docs/ops/deployment.md`](../ops/deployment.md#web-release-identity). Docker exports the selected
build identity as `GIT_HASH`, but that variable is not the configuration identity owner. Next 16.4.2 reloads `next.config.ts` for
`PHASE_PRODUCTION_SERVER` in `node_modules/next/dist/server/next.js`; after the explicit environment
override, production startup reads `.next/RELEASE_ID` before considering a local Git fallback.
The image build writes that file from its source commit, so supported runtime startup needs no Git.
`.next/BUILD_ID` is not that identity and must
not be used as one. Follow the recovery procedure in
`docs/ops/deployment.md`.

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

The existing application explicitly retains `partialPrefetching: false` while adopting
Next.js 16.4.2. This matches the previously unset option's behavior, without its startup
warning; enabling Partial Prefetching changes existing full-prefetch semantics and is a
separate migration. Evidence: installed `next/dist/server/config.js:449-458` and the
official `partialPrefetching`/adoption guides retrieved through Context7 on 2026-10-25.

`htmlLimitedBots` decides which user agents receive blocking `<head>` metadata instead of
metadata streamed into `<body>`. Google ignores a `rel=canonical` outside `<head>`, and link
unfurlers, AI crawlers, SEO-audit bots and CLI probes outside Next's default list read only the
initial HTML, so `next.config.ts` extends `HTML_LIMITED_BOT_UA_RE` across search, AI, SEO-audit
and CLI user agents while leaving interactive browser user agents unmatched. On a partially
prerendered route a match bypasses the static shell (`shouldForceDynamicPPRRender`), because the
shell has already closed `<head>`, so crawlers and HTTP probes receive an on-demand render with
full `<head>` metadata while interactive browsers still receive the prerendered static shell.
Evidence: installed `next/dist/server/config.js:1402-1405` (the RegExp is serialized to its
source), `next/dist/server/lib/streaming-metadata.js` (the pattern decides streaming),
`next/dist/build/templates/app-page-runtime.js:342-348` (`shouldForceDynamicPPRRender`), and the
official `htmlLimitedBots` reference.

The root layout has no `<Suspense>`, so page content renders into the prerendered shell, where
crawlers that skip JavaScript read it. React emits a completed boundary larger than its
progressive chunk size as a hidden segment that a script reveals, so a boundary around a whole
page hides that page from those crawlers; keep request-time and uncached reads in small local
boundaries instead. The Docker build and the pre-push gate set `USE_NEXTJS_CACHE=false`, so
readers that gate `"use cache"` on it read files and the database directly. Next runs the final
prerender's stages as consecutive timers in one event-loop phase, which ends before any file or
database read returns, so content behind such a read always resolves after the shell. A route
that renders it outside a boundary fails the build with `blocking-prerender-dynamic`; the books
and blog tag segments own a `loading.tsx` for that reason, and the thought segment owns one
because `readThoughtBySlug` is an uncached database read whatever the flag says. A page that calls
a literal `"use cache"` function, as `/blog` and `/blog/[slug]` do, stays in the shell.
Evidence: installed `next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js` defaults
`progressiveChunkSize` to 12800 and outlines a boundary when
`flushedByteSize + boundary.byteSize > request.progressiveChunkSize`;
`next/dist/server/app-render/app-render-render-utils.js` (`runInSequentialTasks`) schedules the
stages through `app-render-scheduling.js` (`createAtomicTimerGroup`).

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

### Essential HTML and Optional Short-Lived Caches

`src/lib/ai-analysis/reader.server.ts` gives missing analysis a one-second cache
profile (`stale: 0, revalidate: 1, expire: 1`). Such a short expiry becomes a PPR
dynamic hole, not static shell content. Awaiting that optional read above essential
content can therefore defer the whole subtree. Keep project headings, descriptions,
and destination links in the server-owned `project-detail.tsx`; only
`project-detail-analysis.server.tsx` reads analysis under its own Suspense boundary.
Parallax belongs to `project-detail-image.client.tsx`, not the text/link shell.
Contact windows/cards must render their normal initial state without waiting for
effect-based registration or mount timers.

Keep Cache Components enabled. Query-dependent Latest bookmark content stays under
Suspense while the server resolves the requested slice. Dynamic index hubs (`/bookmarks`,
`/books`) render `<main>`, the page's single semantic `<h1>` and its introduction outside
`<Suspense>`, so the shell carries them before any dynamic read resolves; window chrome
titles are not headings.
Verify native DOM/HTML, not matching text inside serialized Flight data:
`e2e/native-content.spec.ts` covers no-JavaScript project/contact rendering and
`scripts/native-content-smoke.ts` supplies the existing production smoke's markup checks.

Evidence: installed `next/dist/server/use-cache/use-cache-wrapper.js:1683-1722` and
`next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md#prerendering-behavior`;
official `cacheLife` guidance retrieved through Context7 on 2026-10-25 confirms
`expire` below five minutes is excluded from prerenders and requires Suspense.

### Activity-Preserved Route DOM

Cache Components retain recently visited route trees in React `Activity` boundaries.
Hidden Activities preserve host DOM with `display: none` while disconnecting layout
effects; they do not unmount route-owned elements. Document-global consumers therefore
must not treat visual hiding as semantic removal.

Keep route-scoped JSON-LD in the canonical `JsonLdScript` Client Component leaf.
Its server snapshot preserves the native script for crawlers. Keep the script node
present during streamed hydration: omitting it on the initial client render can
misalign the following Suspense boundary. Inactive routes use `application/json`
instead of `application/ld+json`, so their preserved DOM contributes no structured
data. The visible route's layout effect activates JSON-LD before paint; cleanup
returns the script to ordinary JSON when its Activity hides. Client-only hidden
mounts start inactive. Do not replace this lifecycle with document queries,
mutation observers, route registries, hard navigation, IDs, or `next/script`
deduplication.

Installed evidence: `node_modules/next/dist/client/components/layout-router.js` retains
inactive segments in hidden Activities; `node_modules/react-dom/cjs/react-dom-client.development.js`
hides their host nodes without removing them. The current contracts are documented in
the official React `Activity` and Next.js preserving UI state guides.

### Blog MDX Rendering

`src/lib/blog/mdx.ts` compiles only repository-owned `data/blog/posts/*.mdx` with
`next-mdx-remote@6.0.0`, `blockJS: false`, and `blockDangerousJS: true`. The first
setting preserves the existing MDX expressions; the second retains the library's
best-effort dangerous-expression filter. This is not a general allowance for
request-supplied MDX or a reason to disable the dangerous-expression filter.

Keep the cached manual evaluator in
`src/components/features/blog/blog-article/mdx-content.client.tsx`. It deliberately
does not import `next-mdx-remote`'s `MDXRemote` client component, whose installed
entrypoint imports an idle-callback polyfill that patches `window.requestIdleCallback`
and `window.cancelIdleCallback`. Do not replace that evaluator with a client polyfill
or another global patch. It still evaluates the serialized source through `Function`,
so the existing CSP requirement remains part of the renderer contract.

Installed-source evidence: `node_modules/next-mdx-remote/dist/serialize.js:12-44`
adds the dangerous-expression plugin when JavaScript is allowed, and
`node_modules/next-mdx-remote/dist/index.js:5` imports the global-mutating polyfill
implemented at `node_modules/next-mdx-remote/dist/idle-callback-polyfill.js:5-24`.
`remark-gfm@4.0.1` is the MDX 3-compatible retrofit; do not downgrade to v2, which
called Unified's removed `this.setData` API.

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

Next builds run on the pinned Node runtime through `node ./node_modules/next/dist/bin/next`;
do not add a compatibility layer for timer behavior.

Before changing framework behavior:

1. Inspect the installed Next, React, and Vitest sources that prove the claim.
2. Fetch current official framework guidance through Context7 or the official docs.
3. Map every affected route, metadata builder, test, and cache/invalidation consumer.
4. Run `pnpm run validate`, then the smallest relevant `pnpm run test` command.
5. Run `NODE_ENV=production pnpm run build` for build or rendering changes.

Run tests through `pnpm run test*` so `config/vitest/` loads. Do not add polyfills,
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
pnpm run validate
pnpm run test -- <focused test selector>
NODE_ENV=production pnpm run build
pnpm run deploy:verify
```

For a web runtime update, also build the web image and inspect its node version as
specified in `docs/ops/deployment.md`. After deployment, verify the public bundle
contains the change when the task affects client assets; Cloudflare caching can otherwise
make a passing local build look undeployed.

## Collection index visibility

Synchronous headings inside a page are insufficient when the collection has a segment-level
`loading.tsx`: React can outline that completed boundary into hidden streamed HTML. Keep root index
headings outside data-grid Suspense, and scope required segment fallbacks to detail/tag routes.
Check visible, non-JavaScript `<main>` HTML on the cache-off production build, not just hydration.

Metadata that depends on visible collection state must read the same cached snapshot as the page.
Independently cached module exports can revalidate at different epochs even when their cache-life
profiles match; prefer one cached data reader feeding both metadata and content.
