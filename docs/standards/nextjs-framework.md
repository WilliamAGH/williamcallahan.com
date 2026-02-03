# Next.js 16 Usage Architecture

**Functionality:** `next-js-16-usage`

## Core Objective

Provide a single operational playbook for all work that interacts with our Next.js 16.0.1, React 19.1.1, and Jest 30.1.3 stack. This document removes guesswork by spelling out version-specific changes, outlawed patterns, and the exact verification workflow demanded by AGENTS.md.

## Canonical Sources (read before coding)

- `node_modules/next/dist/server/config.js` – confirms `cacheComponents`, `experimental.ppr` removal, and other hard config rules.
- `node_modules/next/dist/server/request/params.js` – shows async params/metadata behavior under cache components.
- `node_modules/next/dist/shared/lib/image-config.js` – documents image defaults (e.g., `maximumRedirects: 3`).
- `node_modules/react/package.json` – validates the React 19.1.1 runtime.
- `node_modules/jest/package.json` – validates Jest 30.1.3 expectations.
- Next.js upgrade guides `docs/01-app/02-guides/upgrading/version-15.mdx` and `version-16.mdx` (fetched via Context7 MCP).
- React 19 upgrade notes on react.dev (Context7 MCP).
- [`testing-config.md`](./testing-config.md) – Jest 30 execution rules and tooling setup.
- [`react-server-client.md`](./react-server-client.md) – Server/Client boundary patterns for React 19 in Next.js 16.

## Version Change Log

### Next.js 14 15 (Context7 `version-15.mdx`)

- `experimental.serverComponentsExternalPackages` is now `serverExternalPackages`.
- `experimental.bundlePagesExternals` is now `bundlePagesRouterDependencies`.
- Fonts must import from `next/font/*` instead of `@next/font/*`.
- Temporary `UnsafeUnwrapped` shims existed for synchronous `cookies()`/`headers()` access—**they are disallowed going forward** because Next.js 16 enforces async semantics.
- `@next/codemod@canary upgrade latest` remains the sanctioned codemod path for sweeping migrations.

### Next.js 15 16 (Context7 `version-16.mdx` + node_modules inspection)

- Turbopack is now default; script flags like `next dev --turbopack` are redundant.
- `experimental.dynamicIO` and `experimental.ppr` have been folded into `cacheComponents` (`node_modules/next/dist/server/config.js:325-338`). Do **not** add new experimental flags—set `cacheComponents: true` instead.
- Metadata + sitemap params are promises inside cache components. Always `await id`/`params` in `sitemap()`, `generateImageMetadata()`, and OG image handlers (see Context7 snippet + `node_modules/next/dist/server/request/params.js:150-226`).
- `skipMiddlewareUrlNormalize` is renamed to `skipProxyUrlNormalize` in `next.config.*`.
- `unstable_cacheLife`/`unstable_cacheTag` have stable names—import `{ cacheLife, cacheTag }` from `next/cache`.
- `next/legacy/image` is deprecated; `next/image` is mandatory.
- Image fetching now caps redirects at 3 by default (`node_modules/next/dist/shared/lib/image-config.js:37-73`). Override only with documented justification.
- Cache Components automatically enables the modern `use cache` directive; ensure routes opt-in explicitly when needed.

### React 19 Interplay

- Metadata tags (`<title>`, `<meta>`, `<link>`) render directly inside components and hoist to `<head>`.
- New resource APIs (`prefetchDNS`, `preconnect`, `preload`, `preinit`) live in `react-dom` and should replace ad-hoc script/link injection.
- `ReactDOM.render` usage must be migrated to `ReactDOMClient.createRoot` via the `react/19/replace-reactdom-render` codemod.
- The React Compiler defaults to `target: '19'`; do not override unless absolutely necessary.

### Jest 30 guardrails

- Confirm all test utilities work with `jest@30.1.3` and `@types/jest@30`. Avoid packages that patch globals incompatible with this runtime.

## Build-Stability Runbook (Repository-Specific)

These are the failure modes that blocked >100 deploy attempts. Follow each checklist before touching framework files or opening a PR.

### 1. Async request params & metadata (Promises everywhere)

- **Mandatory pattern:** Resolve `params`/`searchParams`/`id` immediately via `const resolved = await params` or `await Promise.resolve(params)` before destructuring.
- **Reference implementations:**
  - `app/bookmarks/page/[pageNumber]/page.tsx:34-111` – uses `const paramsResolved = await Promise.resolve(params)` for both `generateMetadata` and the page component.
  - `app/blog/[slug]/page.tsx:78-118` – destructures `{ slug } = await params` before any lookups.
  - `app/bookmarks/tags/[...slug]/page.tsx:86-147` and `app/bookmarks/[slug]/page.tsx:182-297` follow the same pattern for complex Zod validation.
- **Sitemap / metadata builders:** `app/sitemap.ts` now enforces `dynamic = "force-dynamic"` and iterates S3 pages sequentially via `getBookmarksPage()` while streaming tag indexes with `listBookmarkTagSlugs()` + `getTagBookmarksIndex()`/`getTagBookmarksPage()`. Never reintroduce a build-time bulk fetch; keep params asynchronous and limit memory by processing one page at a time.
- **Action items when adding new routes:** copy one of the reference patterns, add a code comment citing this section, and include tests under `__tests__/app/` that cover invalid params so we catch missing `await` calls.

#### 1.a Guarding Date/Time usage (`next-prerender-current-time`)

- **Problem:** Next.js 16 throws [next-prerender-current-time](https://nextjs.org/docs/messages/next-prerender-current-time) if `Date.now()`, `Date()`, or `new Date()` executes before any uncached `fetch()`/DB call or before request-bound data (`headers()`, `cookies()`, `connection()`, `searchParams`). This blocks prerendering and killed several builds.
- **Repository guidance:**
  - Use `performance.now()`/`performance.timeOrigin + performance.now()` for profiling/diagnostics. Never feed those values into render output or cache keys.
  - If the timestamp should be cached with the page, move it inside a cache component/function (`"use cache"`) so it only runs during ISR/revalidation (see Next.js doc’s “Cacheable use case”).
  - If the time must be request-specific, prefer a Client Component (wrap it in `<Suspense>`). When that’s impossible, await request data first (`await connection()` or run the uncached `fetch`) **before** calling `Date.now()`.
  - When third-party code reads the current time, wrap the call site in a helper that invokes `await connection()` prior to the import so Next.js recognizes it as request-time logic.
- **Code search:** `rg "Date\.now" -g"*.ts*"` currently shows only test/scripts/client files, but re-run this search before every PR to ensure no server entry point reintroduces the anti-pattern.

### 2. Turbopack + build CLI expectations

- **Dev/build scripts:** `package.json:18-44` launches `node --expose-gc ./node_modules/next/dist/bin/next dev` and `next build` without any `--turbopack` flags. Do **not** add CLI switches; Turbopack is already the default runtime in v16.
- **`next.config.ts:250-320`** documents the server output settings that keep CI stable (disabled `poweredByHeader`, `productionBrowserSourceMaps`, custom `staticGenerationMaxConcurrency`). Any deviation must include measured heap usage.
- **When builds hang:** capture the failing command plus stderr, then inspect `<repo>/.next/turbopack/.../trace.log`. Document the incident at the bottom of this file before retrying.
- **Local verification loop:** `bun run validate && NODE_ENV=production bun run build` is the minimum to reproduce CI (remember the custom `NODE_OPTIONS` in `package.json`).

### 3. Cache Components + fetch caching discipline

- **Configuration source-of-truth:** `next.config.ts:286` enables `cacheComponents: true`. Never reintroduce `experimental.ppr`, `dynamicIO`, or `force-static` overrides without updating this doc.
- **Cache helpers:** when a module needs tagging/staleness, import `{ cacheLife, cacheTag }` from `next/cache`. Example: update `lib/server/data-fetch-manager.ts` when we need a new tag rather than reusing `unstable_cache`.
- **Fetch defaults:** With cache components on, `fetch()` remains uncached unless `next: { revalidate }` is set. Document intent inline (e.g., `// Next 16: do not cache because ...`).

#### 3.a Static-to-Dynamic Runtime Errors (CRITICAL)

**Problem:** Pages prerendered as static at build time can fail at runtime if they attempt to become dynamic. This manifests as:

```
Error: Page changed from static to dynamic at runtime /path, reason: revalidate: 0 fetch
```

**Root Causes:**

1. **`cache: "no-store"` in fetch calls** — equivalent to `revalidate: 0`, which forces dynamic rendering
2. **`connection()` bailout from `next/server`** — causes `DYNAMIC_SERVER_USAGE` errors
3. **`Date.now()` before data access** — causes `next-prerender-current-time` errors

**Prevention Protocol:**

| Pattern                   | Status    | Alternative                                      |
| ------------------------- | --------- | ------------------------------------------------ |
| `cache: "no-store"`       | FORBIDDEN | `next: { revalidate: 300 }` (or appropriate TTL) |
| `connection()` import     | FORBIDDEN | Remove entirely—pages are dynamic by default     |
| `Date.now()` before fetch | FORBIDDEN | Use `0` sentinel or move after data access       |
| `revalidate: 0`           | FORBIDDEN | Use positive revalidation time                   |

**Real-World Fix (Books feature):**

```typescript
//  BEFORE: Caused static-to-dynamic error
const response = await fetch(url, { cache: "no-store" });

//  AFTER: Works with cacheComponents
const response = await fetch(url, { next: { revalidate: 300 } });
```

```typescript
//  BEFORE: DYNAMIC_SERVER_USAGE error
import { connection } from "next/server";
export async function BooksServer() {
  await connection(); // Bailout from static rendering
  // ...
}

//  AFTER: No bailout needed
export async function BooksServer() {
  // Pages are dynamic by default with cacheComponents
  // ...
}
```

**Detection Commands:**

```bash
# Find no-store usage that could cause issues
grep -r "cache.*no-store\|no-store" --include="*.ts" --include="*.tsx" lib/ components/ app/

# Find connection() imports
grep -r "from.*next/server.*connection\|connection.*from.*next/server" --include="*.ts" --include="*.tsx"

# Find revalidate: 0
grep -r "revalidate.*:.*0" --include="*.ts" --include="*.tsx"
```

- **Bookmarks + S3:** `app/sitemap.ts` streams bookmarks by page and aggregates tag metadata without loading the full dataset. Any new cache invalidation must also touch `lib/bookmarks/service.server.ts` so ISR + cache components agree. Keep the per-page iteration to protect heap usage.
  - Docker builds now always read the `.next/cache/local-s3` snapshots because `lib/bookmarks/bookmarks-data-access.server.ts` only disables the local fallback when `NEXT_PHASE === "phase-production-server"` (see guard near the top of that file). This keeps `bun run build` offline-safe even when S3 isn’t reachable.
- **Offline local builds:** CI/CD must hit S3/CDN, so local fallbacks are disabled whenever `NODE_ENV=production` (same state as `bun run build`). To run a production build without network access, set `FORCE_LOCAL_S3_CACHE=true` before invoking the build so `.next/cache/local-s3` is used. Never enable this in Docker/Coolify.

### 4. Image optimizer contract (CANONICAL)

1. **CDN URLs flow through `/_next/image` for optimization.** Use direct CDN URLs (e.g., `https://s3-storage.callahan.cloud/images/foo.jpg`) with `<Image>` and let Next.js optimize. Sharp resizes to the requested width, converts to WebP/AVIF, and caches for 7 days.

2. **NEVER proxy CDN images through `/api/cache/images`.** This bypasses optimization because `/api/*` routes require `unoptimized`. The `buildCachedImageUrl()` function is ONLY for external URLs needing SSRF protection.

3. **External URLs must be proxied.** URLs not in `images.remotePatterns` (Twitter, LinkedIn, etc.) go through `/api/cache/images` with `unoptimized`.

4. **`sizes` prop is mandatory.** Every `<Image>` must specify `sizes` for correct srcset generation:

   ```tsx
   sizes = "(max-width: 768px) 100vw, 400px"; // Card images
   sizes = "64px"; // Fixed-size logos
   sizes = "100vw"; // Full-width images
   ```

5. **Use `getOptimizedImageSrc()` helper.** This function (in `cdn-utils.ts`) returns the correct src and determines whether `unoptimized` is needed based on the URL source. Pair with `shouldBypassOptimizer()` for the `unoptimized` prop.

6. **Redirect limit awareness.** Node 22 + Next 16 limit remote image redirects to 3 (`node_modules/next/dist/shared/lib/image-config.js:37-73`). Override `images.maximumRedirects` only with documented rationale.

7. **Await OG/image params.** When Turbopack reports `Missing image response meta`, inspect `/app/(.*)/opengraph-image.tsx` handlers—they receive async params, so you must `await` before building OG data.

**Detection Commands:**

```bash
# Find incorrect proxy usage for CDN URLs
grep -r "buildCachedImageUrl" --include="*.tsx" src/components/

# Find missing sizes prop
grep -r "<Image" --include="*.tsx" -A5 | grep -v "sizes="
```

**Error Symptoms:**
| Pattern | Result |
|---------|--------|
| `buildCachedImageUrl(cdnUrl)` + `unoptimized` | No optimization, full-size images served |
| Missing `sizes` prop | Browser downloads largest srcset variant |
| Direct external URL without proxy | `/_next/image` rejects as not in remotePatterns |

### 5. Link Prefetch Behavior (Next.js 16)

**Understanding the defaults:**

- **App Router default:** `prefetch={null}` — NOT `true`
- **Viewport prefetching:** Links prefetch when entering viewport (200px IntersectionObserver margin)
- **Static routes:** full prefetch on viewport entry
- **Dynamic routes:** prefetch to nearest `loading.js` boundary

**`prefetch={false}` behavior:**

Completely disables prefetch (BOTH viewport AND hover triggers).

- **Source:** `node_modules/next/dist/esm/client/app-dir/link.js:309-311`
- **Doc:** https://nextjs.org/docs/app/api-reference/components/link#prefetch

**When to use `prefetch={false}`:**

| Context                                      | Recommendation                       |
| -------------------------------------------- | ------------------------------------ |
| Primary navigation (header, footer)          | Keep default (allow prefetch for UX) |
| List/grid views (bookmark cards, blog cards) | Use `prefetch={false}`               |
| Tag clouds/chips                             | Use `prefetch={false}`               |
| Dropdown/secondary navigation                | Use `prefetch={false}`               |

**Rationale:** High-volume lists can fire dozens of prefetch requests on page load or scroll, increasing network traffic and server load. Primary navigation remains fast because users expect instant transitions there.

**Example:**

```tsx
// In list contexts, disable prefetch to reduce request volume
<Link href={`/bookmarks/${id}`} prefetch={false}>
  {title}
</Link>
```

### 6. Documentation + MCP receipts

- Every framework PR must paste the specific MCP query + node_modules file reference into its description. Example: "Context7 `/vercel/next.js` topic `version-16` confirms async sitemap params – see `node_modules/next/dist/server/request/params.js:150-226`."
- Update this runbook when new failure modes appear.

### 7. Cache Components Rendering Modes (CRITICAL)

**Incompatibilities with `cacheComponents: true`:**

1. `unstable_noStore()` in page components -> causes `DYNAMIC_SERVER_USAGE` error
2. `export const dynamic = "force-dynamic"` -> causes build error

**Key Understanding:**

Next.js 16 with Cache Components fundamentally changes the rendering model:

- **Old Model (Next.js 15):** Pages are static by default, use `noStore()` or `dynamic = "force-dynamic"` to opt into dynamic
- **New Model (Next.js 16 + cacheComponents):** Pages are **DYNAMIC BY DEFAULT**, use `'use cache'` to opt into static

**Forbidden Patterns:**

```typescript
//  BROKEN #1: Runtime API (causes DYNAMIC_SERVER_USAGE error)
import { unstable_noStore as noStore } from "next/cache";
export default function Page() {
  noStore();
  // ...
}

//  BROKEN #2: Route segment config (causes build error)
export const dynamic = "force-dynamic";
export default function Page() {
  // Error: "Route segment config 'dynamic' is not compatible with `nextConfig.cacheComponents`"
  // ...
}
```

**Correct Patterns for Cache Components:**

```typescript
//  STATIC PAGE: Use 'use cache' directive
'use cache';

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Static Page" };

export default function StaticPage() {
  // This page will be pre-rendered and cached
  return <div>Static content</div>;
}
```

```typescript
//  DYNAMIC PAGE: NO DIRECTIVE NEEDED
import type { Metadata } from "next";

// Pages are dynamic by default with cacheComponents enabled
// Just remove all caching/dynamic directives

export default async function DynamicPage() {
  // This page renders at request time automatically
  const data = await fetch('/api/data', { cache: 'no-store' });
  return <div>{data}</div>;
}
```

**Key Distinctions Table:**

| Rendering Mode | Next.js 15 Pattern                       | Next.js 16 + cacheComponents Pattern        | Notes                              |
| -------------- | ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| Static         | Default (no exports)                     | `'use cache'` directive at top of file      | Explicitly opt into caching        |
| Dynamic        | `export const dynamic = 'force-dynamic'` | **NO EXPORT** - dynamic by default          | Just remove all directives         |
| Dynamic        | `unstable_noStore()` call                | **NO EXPORT** - dynamic by default          | Remove the import and call         |
| ISR            | `export const revalidate = <seconds>`    | `'use cache'` + `cacheLife()` configuration | Use new caching APIs               |
| API Routes     | `unstable_noStore()` allowed             | `unstable_noStore()` still works            | API routes exempt from this change |

**Error Symptoms:**

| Pattern                | Dev Behavior     | Prod Behavior                                      |
| ---------------------- | ---------------- | -------------------------------------------------- |
| `noStore()` in page    | Renders (silent) | `DYNAMIC_SERVER_USAGE` 500 error                   |
| `export const dynamic` | N/A              | Build fails: "not compatible with cacheComponents" |

**Required Pattern:**

| Page Type | Action                                             |
| --------- | -------------------------------------------------- |
| Static    | Add `'use cache';` at top of file (before imports) |
| Dynamic   | Remove all directives—dynamic is default           |

**Search Commands to Find Violations:**

```bash
# Find old runtime API usage
grep -r "unstable_noStore\|noStore()" app/ --include="page.tsx" --include="page.ts"

# Find incompatible route segment config
grep -r "export const dynamic" app/ --include="page.tsx" --include="page.ts"
```

**Real-World Examples from Codebase:**

**Static Page (investments):**

```typescript
// app/investments/page.tsx
'use cache';

import type { Metadata } from "next";
import { Investments } from "@/components/features";

export const metadata: Metadata = getStaticPageMetadata("/investments", "investments");

export default function InvestmentsPage() {
  // Pre-rendered and cached
  return <Investments investments={investments} />;
}
```

**Dynamic Page (bookmarks):**

```typescript
// app/bookmarks/page.tsx
import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";

// NO 'use cache' - page is dynamic by default
// NO export const dynamic - incompatible with cacheComponents

export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/bookmarks", "bookmarks");
}

export default function BookmarksPage() {
  // Renders at request time, fetches from S3
  return (
    <BookmarksServer
      title="Bookmarks"
      description="..."
      initialPage={1}
      includeImageData={true}
    />
  );
}
```

**Official Documentation References:**

1. **Cache Components Fundamental Guide**
   - **URL:** https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/06-cache-components.mdx
   - **Source Code:** `node_modules/next/dist/server/config.js:1336-1338` (cacheComponents default behavior)
   - **Quote:** "When Cache Components are enabled, `dynamic = 'force-dynamic'` is no longer necessary as all pages are dynamic by default. Just remove it."
   - **Key Pattern:** Pages are **dynamic by default**, use `'use cache'` to opt into static

2. **'use cache' Directive API Reference**
   - **URL:** https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/01-directives/use-cache.mdx
   - **Purpose:** Opt pages/components into static rendering with cacheComponents enabled
   - **Usage:** Place `'use cache';` at module top (before imports) for static pages
   - **Applies to:** Entire route segments (page.tsx/layout.tsx) and individual components

3. **unstable_noStore() Deprecation Notice**
   - **URL:** https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/unstable_noStore.mdx
   - **Status:** Deprecated for page components with cacheComponents
   - **Migration:** Use `connection()` from 'next/server' or remove entirely
   - **Exception:** API routes (`app/api/**/route.ts`) can still use it

4. **Route Segment Config Incompatibility**
   - **URL:** https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/route-segment-config.mdx
   - **CRITICAL:** `export const dynamic` is **incompatible** with `cacheComponents: true`
   - **Error Message:** "Route segment config 'dynamic' is not compatible with `nextConfig.cacheComponents`"
   - **Resolution:** Remove the export - pages are dynamic by default

5. **React 19 Server Components & Async APIs**
   - **URL:** https://react.dev/blog/2024/12/05/react-19
   - **Changes:** All dynamic APIs now return Promises (`params`, `searchParams`, `cookies()`, `headers()`)
   - **Impact:** Must `await` all dynamic data in Server Components
   - **Patterns:** Async metadata functions, async page components

6. **Next.js 16 Upgrade Guide (Version 15 -> 16)**
   - **URL:** https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/upgrading/version-16.mdx
   - **Key Migration:** `experimental.dynamicIO` -> `cacheComponents: true`
   - **Breaking Change:** Inverted rendering default (static -> dynamic)

**Prevention Protocol:**

1. **NEVER** use `unstable_noStore()` in page components
2. **NEVER** use `export const dynamic = "force-dynamic"` with cacheComponents enabled
3. Run search commands before every deployment to catch violations
4. **Always test with** `NODE_ENV=production bun run build` locally
5. Monitor production logs for `DYNAMIC_SERVER_USAGE` digest errors
6. For static pages: Add `'use cache'` directive
7. For dynamic pages: **Remove all directives** - dynamic by default

**Mental Model:**

Think of Cache Components as **inverting the default**:

- **Before:** Static by default, opt into dynamic
- **After:** Dynamic by default, opt into static with `'use cache'`

> **CRITICAL MANDATE:** With `cacheComponents: true`, pages are **dynamic by default**. Use `'use cache'` for static pages. Never use `export const dynamic = "force-dynamic"` - it will cause build failures. Any PR introducing these patterns will be rejected.

## Allowed Patterns ()

| Area         | Requirement                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Rendering    | Enable `cacheComponents` in `next.config.ts` and treat async params/headers/cookies as promises. |
| Metadata     | Use React 19 head primitives; server metadata builders must `await` params ids.                  |
| Data Caching | Import `{ cacheLife, cacheTag }` from `next/cache` with stable names.                            |
| Images       | Configure `images.maximumRedirects` deliberately when deviating from the default (3).            |
| Tests        | Reference `config/jest/config.ts` and Jest 30 APIs directly; document any mock shims.            |
| Tooling      | Run `bun run validate` plus at least one MCP doc fetch + node_modules citation per task.         |

## Outlawed Patterns ()

- Using `next/legacy/image`, `experimental.ppr`, `experimental.dynamicIO`, or `unstable_cache*` aliases.
- Writing synchronous wrappers around `cookies()`, `headers()`, `params`, or `id` instead of awaiting the provided promise.
- Dropping Turbopack flags back into scripts—they are redundant and invite drift.
- Adding polyfills or downgraded packages that conflict with Node 22 native APIs.
- Introducing React 18-era APIs (`ReactDOM.render`, legacy metadata helpers) without explicit owner approval.
- **CRITICAL:** Using `unstable_noStore()` in page components when `cacheComponents: true` (see §6).
- **CRITICAL:** Using `export const dynamic = "force-dynamic"` in page components when `cacheComponents: true` - causes build errors (see §6).
- **CRITICAL:** Module-scope `NEXT_PHASE` checks (e.g., `const x = process.env.NEXT_PHASE === "..."`) — evaluated at build time and baked into bundle. Use a function: `const x = () => process.env.NEXT_PHASE === "..."`.
- **CRITICAL:** Using `connection()` from `next/server` in page/component code—causes `DYNAMIC_SERVER_USAGE` errors at runtime (see §3.a).
- **CRITICAL:** Using `cache: "no-store"` or `revalidate: 0` in fetch calls for statically prerendered pages—causes "Page changed from static to dynamic" errors (see §3.a).
- **CRITICAL:** Calling `Date.now()` before any data access (fetch, headers, cookies)—causes `next-prerender-current-time` errors (see §1.a).

## Workflow Checklist (mirror AGENTS.md)

1. **Purpose alignment:** capture the why and log it in your working note.
2. **Architecture context:** re-read `docs/projects/structure/00-architecture-entrypoint.md`, this file, and any related functionality docs.
3. **Type inspection:** review applicable files under `types/` before changing props/contracts.
4. **Node_modules inspection:** cite the exact file + line that proves each framework claim.
5. **External docs:** fetch at least one Context7/DeepWiki/Brave reference for the current framework version.
6. **Implementation:** enforce Allowed Patterns / block Outlawed Patterns.
7. **Validation:** run `bun run validate` before and after edits and record the outcome.

## Deprecations & Migration Notes

- **Partial Pre-rendering:** Use `cacheComponents` (default true when unset per `node_modules/next/dist/server/config.js:1336-1338`). Remove any codepath that attempts to reintroduce the experimental flag.
- **Image Redirect Loops:** Overriding `images.maximumRedirects` > 3 requires a documented exploit and security review.
- **Middleware URL normalization:** rename stale config helpers or request rewrite utilities to align with `skipProxyUrlNormalize` naming.
- **Testing:** Jest 30 forbids legacy `node-notifier` by default; enable only when required by CI notifications.

> **Reminder:** Every Next.js / React / Jest change must reference this document in the PR/commit summary so reviewers can trace decisions back to a verified playbook.
