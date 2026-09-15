# Testing Configuration & Modernization Guide

**Functionality:** `testing-config`

This document defines the Vitest-based testing architecture for this project. It replaces legacy Jest guidance and aligns with Next.js 16 + React 19 + Bun runtime constraints.

## Anti-Polyfill Mandate

This codebase forbids polyfills. Use native runtime APIs, ponyfills, or targeted mocks only. Do not patch `globalThis`, `window`, or `global` to emulate legacy browser environments.

## Core Principle: Vitest Only

All tests run through Vitest via `bun run` scripts so the correct configuration is loaded. Do not use `bun test` directly.

Required scripts:

```bash
bun run test
bun run test:watch
bun run test:coverage
bun run test:ci
bun run test:smoke
```

## Next.js 16 + Vitest Constraints

Vitest does not support rendering async Server Components. Unit tests may cover
synchronous Server and Client Components. Every async App Router route regression
requires Playwright E2E coverage at the actual route layer; do not substitute a
component/unit-test workaround for an async page, layout, or Server Action flow.

## Observable Boundaries, Probes, and the Cheapest Lane

### Assert at a boundary, or assert nothing ([TST1d], [TST1f])

A test earns its place only by asserting something a user or a caller can observe:

- rendered DOM through `@testing-library/react` — queries, roles, visible text
- what a route handler or Server Action returns — status, headers, parsed body
- the return value of a module under `src/lib/**`
- the live route in Playwright when the path is an async Server Component ([TST1g])

Internals are not boundaries. Spy call counts, private helper shapes, module export
lists, and the source text of the artifact under test all keep passing while the
behavior is broken.

When no boundary is reachable — the behavior lives only in Tailwind's compiled output,
only at the Cloudflare edge, or only in an async server path Vitest cannot render — write
no test and say so in the handoff. An honest zero is a real result. A manufactured
assertion is worse than none: it buys a green check and sells the next regression.

### Tautological tests are banned ([TST1h])

A test that reads the file whose behavior it claims to prove, then asserts on that
file's text, proves only that the file still contains the string it contains. Asserting
that `src/app/globals.css` holds a dark-mode media query, or that a config module
mentions a flag, is a spell-checker wearing a test's name.

Before writing any test, ask: **would this fail under a plausible regression implemented
with different text?** If a different property, a different selector, a different import
path, or a formatter pass could reintroduce the bug while the assertion still passes,
the test is tautological. Assert the computed style or the rendered output instead, or
take the honest zero.

Carve-out: gates where the file's text _is_ the governed surface — a generated artifact
checked against the inputs that generate it. `__tests__/lib/blog-cover-image-map.test.ts`
qualifies: it reads `data/blog/cover-image-map.json` because that manifest is the
shipped contract, and it compares the manifest against MDX frontmatter rather than
against itself.

### Probes are not tests ([TST1i])

An agent checking its own work is running a probe, not writing a test. Probes include
any assertion aimed at the inverse of a mistake just made — proof that this edit landed,
not proof that a contract holds. Run the probe, read the output, delete it before
committing. Only durable behavioral contracts get committed test files; a repository of
probes is a repository of noise that future changes must keep green for no reason.

### The cheapest-lane ladder ([VR1j])

Climb only when the rung below cannot answer the question:

1. **Types** — editor diagnostics, or `bun run type-check` / `bun run type-check:tests`.
2. **Lint** — `bun run lint:checks` (ast-grep rules via `bun run lint:ast-grep`).
3. **Scratch probe** — a throwaway `.ts` file kept _outside_ the repo (the session
   scratchpad or `/tmp`, per [CP1a]) and executed with `bun /tmp/probe.ts`. Bun runs
   TypeScript directly; import repo modules by absolute path, because the `@/` alias
   resolves through `tsconfig.json` and is unavailable from outside the repo.
4. **Running app** — `bun run dev`, then exercise the real route.
5. **Committed test** — an assertion at the observable boundary. This is the only
   persistent rung; everything above it is deleted when the question is answered.

## Blog Render Gate

`config/blog-render-canaries.ts` is the sole owner of the two representative blog
articles and their assertions. `e2e/blog-render.spec.ts` and
`scripts/blog-render-smoke.ts` import that catalog; neither may recreate its slugs,
titles, markers, or declared interactions. The browser test is required because it
exercises the async route, hydrated MDX, browser errors, same-origin request failures,
and each declared interaction. Its isolated `config/playwright.config.ts` environment
starts Next dev with the dependency-supported `--webpack` option and
`WATCHPACK_POLLING=true`; polling prevents macOS's low file-descriptor watcher ceiling
from making the gate unreliable. Installed-source evidence:
`node_modules/next/dist/bin/next:114` defines the dev `--webpack` option and
`node_modules/watchpack/lib/DirectoryWatcher.js:31-36` reads the polling environment
variable. `test:e2e:blog` traps `next typegen` on every exit because Next dev rewrites
tracked `next-env.d.ts` to its isolated development-types path; the exit handler
regenerates the tracked declaration so a passing or failing browser run leaves the
worktree hygienic.

Run the complete local browser-free gate with:

```bash
bun run verify
```

The automated GitHub gate in `.github/workflows/verification.yml` runs for pull
requests targeting `main` (with `workflow_dispatch` reserved for manual runs), installs
Chromium, and invokes `bun run verify:browser`, which adds the blog E2E test after the
browser-free gate. The pre-push hook in `.config/lefthook.yml` runs the production build
and then the browser-free `bun run verify` gate.

## MDX Toolchain Compatibility

The blog compiler uses `remark-gfm@4.0.1` with MDX 3. Do not restore
`remark-gfm@2.0.0`: its use of Unified's removed `this.setData` API breaks the MDX
pipeline. Preserve the real-MDX smoke and integration coverage when changing this
dependency boundary.

## Configuration Files (Source of Truth)

- `config/vitest.config.ts` defines plugins, jsdom environment, and aliasing for Next.js internals.
- `config/vitest/setup.ts` registers `@testing-library/jest-dom/vitest`, core DOM mocks, and console suppression.
- `config/vitest/env-setup.ts` provides targeted environment mocks only when required by tests.
- `config/vitest/global-mocks.ts` provides global cache API stubs.

## Live Integration Tests (Opt-In)

Some tests exercise real external services and are gated by environment variables with
`describe.runIf(...)`. These tests must remain opt-in and should be run explicitly in
controlled environments.

## Mocking Patterns (Vitest)

Use Vitest primitives:

```typescript
import { vi } from "vitest";

vi.mock("@/lib/data", () => ({
  fetchData: vi.fn(),
}));

const spy = vi.spyOn(console, "error").mockImplementation(() => {});
```

Prefer `vi.importActual` and `vi.importMock` for module factories that need real exports. Avoid CommonJS-specific Jest patterns.

### Mock Placement (Enforced)

Dedicated mock modules must live under `__tests__/__mocks__/`. Do not place mock files directly under `__tests__/` (for example, `**/*mock*.ts` outside `__tests__/__mocks__`). This is enforced by the ast-grep rule `[TST2]`.

## React 19 Testing Notes

Use `act` or `waitFor` when state updates are async. If `React.act` is missing in tests, it is registered in `config/vitest/setup.ts`.

## Troubleshooting

`ReferenceError: vi is not defined` means you ran `bun test` directly. Use `bun run test` so Vitest config loads.

`document is not defined` means the jsdom environment or setup files did not load. Confirm `config/vitest.config.ts` and `config/vitest/setup.ts` are referenced correctly.

## Official Docs

- Next.js 16.1.6 Vitest setup and async-Server-Component E2E guidance: https://github.com/vercel/next.js/blob/v16.1.6/docs/01-app/02-guides/testing/vitest.mdx
- Vitest config: https://vitest.dev/config/
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro/
