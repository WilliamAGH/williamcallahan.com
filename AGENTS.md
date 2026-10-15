---
description: "williamcallahan.com agent rules - ZERO TEMPERATURE development with mandatory verification, type safety, and safe git workflows"
alwaysApply: true
---

Core standards:

- Global rules own every `[XX0]` family; this file only extends them with repository-specific `1` ids and never restates or loosens them
- Read `docs/standards/code-change.md` before any edit

# williamcallahan.com Agent Rules

> **Next.js 16**: Middleware is `src/proxy.ts` (not `middleware.ts`). This file handles Clerk auth and request logging; CSP header construction is in `src/lib/middleware/csp-header.ts`.

---

## Blocking

### [GT1] Git Safety (extends [GT0])

- [GT1c] **Worktree at Inception**: Start each task in a dedicated worktree on a task branch unless the user declines; review and read-only tasks are exempt and stay on the current branch.
- [GT1i] **Repository-Local Writes Only**: The working branch is `dev`; task commits merge into local `dev` ([GT0e]). NEVER commit or push from an unrelated clone, checkout, or directory copy of the repo.

### [LC1] Line Count Ceiling (extends [LC0])

- [LC1c] **Enforcement**: `pnpm run check:file-size` reports violations; `pnpm run validate:with-size` includes the check.
- [LC1d] Exempt files: generated content (lockfiles, builds, artifacts)

### [TS1] Type Safety & Validation (extends [SS0])

- [TS1a] No implicit `any` and no unguarded `unknown`
- [TS1c] All external/IO data must be validated at the boundary with Zod schemas
- [TS1d] Never use type assertions without runtime checks; handle `null`/`undefined` explicitly
- [TS1e] Zod schemas define types; use `z.infer<>` and do not duplicate schema-backed types manually; schemas in `types/schemas/`; import via `import { z } from "zod/v4";`

---

## Domain-Specific

### [FW1] Next.js / React / Vitest Enforcement

- [FW1a] Treat the exact versions in `package.json` as law; verify via `node_modules/<pkg>/package.json` when needed; do not rely on memory or blog posts
- [FW1b] Before any change touching Next.js/React/Vitest behavior, verify by reading relevant `node_modules/` sources; perform at least one MCP lookup (Context7/Brave) for current guidance
- [FW1c] Required reading: `docs/standards/nextjs-framework.md` before framework-level changes; update it if your work changes expectations
- [FW1d] Default expectations: Cache Components + React 19 primitives + modern async params/metadata flows; reject legacy patterns unless explicitly approved (e.g., `next/legacy/image`, synchronous `cookies()` shims)
- [FW1e] Vitest compliance: any test harness change must reference `config/vitest/` and verify the Vitest runtime; never add tooling that downgrades Vitest APIs or adds polyfills to "make tests pass"

### [DEP1] Cloudflare Cache & Deployment

- [DEP1a] Cloudflare aggressively caches static assets. Local passing tests != production bundle updated.
- [DEP1b] After deploying a fix, verify the deployed JS bundle contains the change (fetch the chunk and grep for a unique token)
- [DEP1c] If the deployed bundle does not match local, treat it as a Cloudflare cache issue first (purge or wait TTL)
- [DEP1d] Do not proceed with deeper debugging until you confirm the deployed bundle is actually updated

### [RT1] Runtime Isolation: Database Scripts (Blocking)

- [RT1a] Every script runs on Node 24.18.0: TypeScript through `tsx`, and scripts that connect to PostgreSQL as `*.node.mjs` files with `#!/usr/bin/env node`. Never reintroduce Bun as a runtime: its TLS signature algorithms fail the PostgreSQL handshake (`could not accept SSL connection: no suitable signature algorithm`).
- [RT1c] The `postgres` npm package works under Node.js with `ssl: "require"`. Never add custom certificates, disable SSL, or patch TLS options to work around a client runtime.

### [IMG1] Image Optimization (Blocking)

- [IMG1a] CDN URLs (s3-storage.callahan.cloud, \*.digitaloceanspaces.com) flow directly to `<Image>` for Next.js optimization; never wrap in `buildCachedImageUrl()` or proxy through `/api/cache/images`
- [IMG1b] Only external URLs (third-party origins) use the image proxy for SSRF protection; these require `unoptimized` prop
- [IMG1c] All `<Image>` components with remote sources must have a `sizes` prop for correct srcset generation
- [IMG1d] Contract: `docs/architecture/image-handling.md` (Image Optimization Decision Matrix)

---

## Process & Tooling

### [VR1] Verification Commands

- [VR1a] Build via `pnpm run build` (or `pnpm run build:only` as appropriate)
- [VR1b] Test via `pnpm run test` (or `test:watch`, `test:coverage`, `test:ci`, `test:smoke`)
- [VR1c] `pnpm run validate` (0 errors, 0 warnings) is the commit gate; the lefthook pre-push hook runs `pnpm run verify` on branch pushes, which covers it, so never run it between edits or repeat it ([TV0b])
- [VR1d] Typecheck via `pnpm run type-check` (and `pnpm run type-check:tests` when relevant)
- [VR1e] Format via `pnpm run format` and `pnpm run format:check`
- [VR1f] Deployment readiness: use `pnpm run deploy:verify` and/or `pnpm run deploy:smoke-test`
- [VR1j] [TV0a] rungs here: editor diagnostics or `pnpm run type-check` -> `pnpm run lint:checks` -> `pnpm exec tsx <scratchpad-file>.ts` -> the running `pnpm run dev` server -> a committed boundary test

### [TST1] Testing Protocols

- [TST1a] Run tests only through the `pnpm run test*` scripts so Vitest loads `config/vitest.config.ts` and `config/vitest/`.
- [TST1c] Do not "fix" test issues by adding polyfills/downgrading Vitest; fix the setup/configuration correctly
- [TST1g] `pnpm run verify` is the complete local browser-free gate. Browser verification is explicit via `pnpm run verify:browser` in GitHub CI ([BR0b]).

---

## Meta

### [DOC1] Documentation Architecture (extends [DOC0])

- [DOC1c] When you create/delete/move/significantly change files, update: `docs/architecture/README.md`, `docs/file-map.md`, and the relevant `docs/features/[domain].md` or `docs/architecture/[domain].md`

### [APP] Reference Contracts

- **Code Change Policy**: `docs/standards/code-change.md` ([CC0k], [LC1])
- **Framework Evidence**: `docs/standards/nextjs-framework.md` ([FW1])
- **Type Policy**: `docs/standards/type-policy.md` ([TS1])
- **Testing Protocols**: `docs/standards/testing.md` ([TST1], [VR1j])
- **Deployment**: `docs/ops/verification.md` ([DEP1])
- **Image Optimization Contract**: `docs/architecture/image-handling.md#image-optimization-decision-matrix` ([IMG1])
