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

### Next.js 14 ➜ 15 (Context7 `version-15.mdx`)

- `experimental.serverComponentsExternalPackages` is now `serverExternalPackages`.
- `experimental.bundlePagesExternals` is now `bundlePagesRouterDependencies`.
- Fonts must import from `next/font/*` instead of `@next/font/*`.
- Temporary `UnsafeUnwrapped` shims existed for synchronous `cookies()`/`headers()` access—**they are disallowed going forward** because Next.js 16 enforces async semantics.
- `@next/codemod@canary upgrade latest` remains the sanctioned codemod path for sweeping migrations.

### Next.js 15 ➜ 16 (Context7 `version-16.mdx` + node_modules inspection)

- Turbopack is now default; script flags like `next dev --turbopack` are redundant.
- `experimental.dynamicIO` and `experimental.ppr` have been folded into `cacheComponents` (`node_modules/next/dist/server/config.js:325-338`). Do **not** add new experimental flags—set `cacheComponents: true` instead.
- Metadata + sitemap params are promises inside cache components. Always `await id`/`params` in `sitemap()`, `generateImageMetadata()`, and OG image handlers (see Context7 snippet + `node_modules/next/dist/server/request/params.js:150-226`).
- `skipMiddlewareUrlNormalize` is renamed to `skipProxyUrlNormalize` in `next.config.*`.
- `unstable_cacheLife`/`unstable_cacheTag` have stable names—import `{ cacheLife, cacheTag }` from `next/cache`.
- `next/legacy/image` is deprecated; `next/image` is mandatory.
- Image fetching now caps redirects at 3 by default (`node_modules/next/dist/shared/lib/image-config.js:37-73`). Override only with documented justification.
- Cache Components automatically enables the modern `use cache` directive; ensure routes opt-in explicitly when needed.

### React 19 interplay (React.dev 2024-12 release)

- Metadata tags (`<title>`, `<meta>`, `<link>`) render directly inside components and hoist to `<head>`.
- New resource APIs (`prefetchDNS`, `preconnect`, `preload`, `preinit`) live in `react-dom` and should replace ad-hoc script/link injection.
- `ReactDOM.render` usage must be migrated to `ReactDOMClient.createRoot` via the `react/19/replace-reactdom-render` codemod.
- The React Compiler defaults to `target: '19'`; do not override unless absolutely necessary.

### Jest 30 guardrails

- Confirm all test utilities work with `jest@30.1.3` and `@types/jest@30`. Avoid packages that patch globals incompatible with this runtime.

## Allowed Patterns (✅)

| Area         | Requirement                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Rendering    | Enable `cacheComponents` in `next.config.ts` and treat async params/headers/cookies as promises. |
| Metadata     | Use React 19 head primitives; server metadata builders must `await` params ids.                  |
| Data Caching | Import `{ cacheLife, cacheTag }` from `next/cache` with stable names.                            |
| Images       | Configure `images.maximumRedirects` deliberately when deviating from the default (3).            |
| Tests        | Reference `config/jest/config.ts` and Jest 30 APIs directly; document any mock shims.            |
| Tooling      | Run `bun run validate` plus at least one MCP doc fetch + node_modules citation per task.         |

## Outlawed Patterns (🚫)

- Using `next/legacy/image`, `experimental.ppr`, `experimental.dynamicIO`, or `unstable_cache*` aliases.
- Writing synchronous wrappers around `cookies()`, `headers()`, `params`, or `id` instead of awaiting the provided promise.
- Dropping Turbopack flags back into scripts—they are redundant and invite drift.
- Adding polyfills or downgraded packages that conflict with Node 22 native APIs.
- Introducing React 18-era APIs (`ReactDOM.render`, legacy metadata helpers) without explicit owner approval.

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
