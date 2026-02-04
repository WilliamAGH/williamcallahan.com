---
description: "williamcallahan.com agent rules - ZERO TEMPERATURE development with mandatory verification, type safety, and safe git workflows"
alwaysApply: true
---

Core standards:

- Edit existing, never append (see [FS1a]); read `docs/standards/code-change.md` before any edit
- Clean Code + DDD strictly enforced (see [CC1])
- Rules live here; `docs/` expands rules with HOW/WHY and canonical contracts (<= 350 LOC each); see [ORG], [DOC1]

# williamcallahan.com Agent Rules

> **Next.js 16**: Middleware is `src/proxy.ts` (not `middleware.ts`). This file handles Clerk auth, CSP, and request logging.

Structure: [ORG]; docs architecture: [DOC1]

---

### Foundational

## [ZT1] Epistemic Humility & Verification

- [ZT1a] Training data is FALSE until verified (no "world knowledge"); verify all libraries via `package.json` versions, `node_modules/` sources, or `context7`; do not rely on memory, blog posts, or assumed version features
- [ZT1b] Source of truth order: repo code/docs -> `package.json` versions -> `node_modules/` sources -> MCP/live docs (capture the URL/reference)
- [ZT1c] No unsupported claims: cite `file:line` or doc path; if you cannot, stop and investigate before proceeding
- [ZT1d] Zero-tolerance halt: if a violation is present (or would be introduced), stop, alert with specifics, and wait for instruction
- [ZT1e] **Investigation Sequence** (mandatory for any problem): (1) read existing codebase first (`file:line`); (2) read `docs/*.md` directly; (3) inspect dependency source in `node_modules` or via `context7`; (4) form hypothesis and test; (5) confirm against docs/dependency code; (6) write code/docs citing all references — skip no steps
- [ZT1f] No empty confirmations ("You're right", "Absolutely") before investigation; verify then cite evidence

## [CC1] Clean Code & DDD

- [CC1a] KISS: simplest solution that works; achieve by removing, not adding; use platform/framework defaults unless deviation is proven necessary
- [CC1b] DRY: remove duplication; single sources of truth; extract shared logic; if code is repeated, refactor to one source
- [CC1c] YAGNI: no speculative code; no dead code; solve today's problem only; new abstractions must earn reuse by removing real duplication
- [CC1d] Clean Architecture: dependencies point inward; domain logic must not import from UI/framework layers; contract: `docs/standards/code-change.md`

## [MO1] Modularity & SRP

- [MO1a] No monoliths: avoid multi-concern files and catch-all modules
- [MO1b] New work starts in new files (New feature -> New file); when touching a monolith (Bug fix -> Edit existing), extract at least one seam
- [MO1c] If safe extraction impossible, halt and ask
- [MO1d] Strict SRP: each unit serves one actor; separate logic that changes for different reasons
- [MO1e] Boundary rule: cross-module interaction happens only through explicit, typed contracts; don't mix web/use-case/domain/persistence concerns in one unit
- [MO1f] Extension (OCP): Add functionality via new classes/composition; do not modify stable code to add features; contract: `docs/standards/code-change.md`

---

### Blocking

## [GT1] Git Safety (Blocking)

> **ABSOLUTE RULE**: ALL existing code is intentional user work. NEVER question this premise.

- [GT1a] **Code is Intentional**: ALL uncommitted changes—whether written by you or not—are presumed intentional. NEVER revert, discard, reset, or restore code. NEVER propose, suggest, or ask about reverting. NO EXCEPTIONS.
- [GT1b] **BANNED COMMANDS**: NEVER run: `git reset`, `git checkout .`, `git checkout <file>`, `git stash`, `git restore`, `git clean`, `git revert`, `git commit --amend`, `git rebase`, `git push --force`, `git push --force-with-lease`. This ban is ABSOLUTE.
- [GT1c] **No Branching**: Work on the current branch. NEVER create new branches unless the user explicitly requests it.
- [GT1d] **Permission Required**: Git writes (commits, pushes) require explicit user permission. Read-only git commands (`status`, `log`, `diff`) are always allowed.
- [GT1e] **Hook & Commit Integrity**: Never skip hooks (`--no-verify`, `HUSKY=0`); never delete `.git/index.lock`; no AI attribution; one logical change per commit; describe change + purpose.
- [GT1f] If an unexpected file is staged or modified by hooks, pause and show the diff; do not attempt to "fix" it unprompted.
- [GT1g] **No Panic About Working State**: Do not comment on or halt for unrelated uncommitted changes. Keep working on the requested task and do not bring up the git working state unless the user explicitly asks.
- [GT1h] **No Halts For Unrelated Changes**: Never stop or pause work because you noticed unexpected or unrelated file changes; continue the task unless the user explicitly asks you to investigate.

## [LC1] Line Count Ceiling (Blocking)

- [LC1a] All written, non-generated source files in this repository MUST be <= 350 lines (`wc -l`)
- [LC1b] SRP Enforcer: This 350-line "stick" forces modularity (DDD/SRP); > 350 lines = too many responsibilities (see [MO1d])
- [LC1c] **Enforcement**: `bun run check:file-size` reports violations; `bun run validate:with-size` includes the check. Legacy files may exceed; new code MUST comply.
- [LC1d] Exempt files: generated content (lockfiles, builds, artifacts)

## [RC1] Root Cause Resolution (Blocking)

- [RC1a] No silent fallback/degradation paths: no `?? defaultValue` or `|| fallback` that masks errors; fail explicitly or log the fallback
- [RC1b] No error swallowing: no empty catch blocks, no catch-and-ignore, no silent `try/catch` that hides failures
- [RC1c] Investigate -> understand -> fix; no workarounds/shims/compat layers (fix at source or halt)
- [RC1d] One real implementation: no shadow implementations behind flags to "hedge"; contract: `docs/standards/code-change.md`

## [TS1] Type Safety & Validation (Blocking)

- [TS1a] Type safety is absolute: no implicit `any`, no `any`, no unguarded `unknown`
- [TS1b] Never use `@ts-ignore`, `eslint-disable`, or similar suppression to bypass correctness; fix the root cause
- [TS1c] All external/IO data must be validated at the boundary (Zod schemas)
- [TS1d] Never use type assertions without runtime checks; handle `null`/`undefined` explicitly
- [TS1e] Zod schemas define types; use `z.infer<>` and do not duplicate schema-backed types manually; schemas in `types/schemas/`; import via `import { z } from "zod/v4";`
- [TS1f] `bun run validate` must pass with 0 errors and 0 warnings before considering work complete

---

### Code Quality

## [FS1] File & Edit Discipline

- [FS1a] Edit existing over append: search for the right location first; do not create new files unless necessary for the task goal
- [FS1b] Before creating any file: search exhaustively -> analyze existing solutions -> confirm no extension path -> request explicit permission
- [FS1c] Read the entire target file before editing; integrate changes with existing structure (don't blindly append)
- [FS1d] No shims, barrels, or re-exports: no compatibility shims, no `index.ts` re-export barrels, no wrapper modules; import from source module directly
- [FS1e] Efficiency mandate: nearly all edits should result in the same or fewer lines by removing duplication/redundant logic; contract: `docs/standards/code-change.md`

## [UP1] Comprehensive Update Protocol

- [UP1a] Any API/type/function change requires mapping _all_ usages first (imports, call sites, type references, tests, docs)
- [UP1b] During the change, track and update every usage systematically; missing one usage is a correctness failure
- [UP1c] After the change, audit for leftovers (search for old names/patterns) and run the verification loops
- [UP1d] Final rule: an update is not complete until every usage has been updated and verified

---

### Domain-Specific

## [FW1] Next.js / React / Vitest Enforcement

- [FW1a] Treat the exact versions in `package.json` as law; verify via `node_modules/<pkg>/package.json` when needed; do not rely on memory or blog posts
- [FW1b] Before any change touching Next.js/React/Vitest behavior, verify by reading relevant `node_modules/` sources; perform at least one MCP lookup (Context7/Brave) for current guidance
- [FW1c] Required reading: `docs/standards/nextjs-framework.md` before framework-level changes; update it if your work changes expectations
- [FW1d] Default expectations: Cache Components + React 19 primitives + modern async params/metadata flows; reject legacy patterns unless explicitly approved (e.g., `next/legacy/image`, synchronous `cookies()` shims)
- [FW1e] Vitest compliance: any test harness change must reference `config/vitest/` and verify the Vitest runtime; never add tooling that downgrades Vitest APIs or adds polyfills to "make tests pass"

## [DEP1] Cloudflare Cache & Deployment

- [DEP1a] Cloudflare aggressively caches static assets. Local passing tests != production bundle updated.
- [DEP1b] After deploying a fix, verify the deployed JS bundle contains the change (fetch the chunk and grep for a unique token)
- [DEP1c] If the deployed bundle does not match local, treat it as a Cloudflare cache issue first (purge or wait TTL)
- [DEP1d] Do not proceed with deeper debugging until you confirm the deployed bundle is actually updated

## [PL1] Polyfills & Global Patching

- [PL1a] Do not introduce polyfill dependencies or global patching packages (e.g., `core-js`, `@babel/polyfill`, `node-fetch`) without explicit approval
- [PL1b] Use native runtime APIs; if compatibility is required, use ponyfills (import-only) or feature detection—not global mutation
- [PL1c] If you think a polyfill is required, stop and discuss alternatives before making changes

## [BP1] Boilerplate Prohibition

- [BP1a] Do not paste tutorial/boilerplate/template code. Code must follow this repo's existing patterns and be purpose-driven.
- [BP1b] Forbidden: placeholder implementations (`// TODO: implement`), generic tutorial-y function names (`handleSubmit`, `processData`), placeholder text ("Lorem ipsum")
- [BP1c] If boilerplate/example code is detected, stop and surface the exact `file:line` and required replacement action

## [ENV1] Environment Variable Policy

- [ENV1a] Never introduce new required environment variables (including `NEXT_PUBLIC_*`) without explicit, repeated, affirmative consent
- [ENV1b] No silent changes to `.env`, `.env-example`, CI/CD secrets, or runtime configs
- [ENV1c] Approval workflow: document rationale and exact variable names; wait for a direct "yes" before committing code that depends on them

## [IMG1] Image Optimization (Blocking)

- [IMG1a] CDN URLs (s3-storage.callahan.cloud, \*.digitaloceanspaces.com) flow directly to `<Image>` for Next.js optimization; never wrap in `buildCachedImageUrl()` or proxy through `/api/cache/images`
- [IMG1b] Only external URLs (third-party origins) use the image proxy for SSRF protection; these require `unoptimized` prop
- [IMG1c] All `<Image>` components with remote sources must have a `sizes` prop for correct srcset generation
- [IMG1d] Contract: `docs/architecture/image-handling.md` (Image Optimization Decision Matrix); lint enforced via `rules/ast-grep/no-cdn-image-proxy.yml`

---

### Process & Tooling

## [VR1] Verification Commands

- [VR1a] Build via `bun run build` (or `bun run build:only` as appropriate)
- [VR1b] Test via `bun run test` (or `test:watch`, `test:coverage`, `test:ci`, `test:smoke`); NEVER run `bun test` directly (bypasses Vitest config)
- [VR1c] Lint/validate via `bun run validate` (canonical gate; run before and after non-trivial changes; must be clean; no bypass)
- [VR1d] Typecheck via `bun run type-check` (and `bun run type-check:tests` when relevant)
- [VR1e] Format via `bun run format` and `bun run format:check`
- [VR1f] Deployment readiness: use `bun run deploy:verify` and/or `bun run deploy:smoke-test`

## [TST1] Testing Protocols

- [TST1a] Never run `bun test` directly. Always use `bun run test*` scripts so Vitest loads `config/vitest/`.
- [TST1b] Direct `bun test` bypasses the project config and causes missing `vi.mock`, module resolution failures—treat this as a violation
- [TST1c] Do not "fix" test issues by adding polyfills/downgrading Vitest; fix the setup/configuration correctly
- [TST1d] Test coverage is mandatory: new functionality and significant modifications require corresponding tests before task completion
- [TST1e] Discovery-first: before writing tests, locate existing test files (`__tests__/`, `*.test.ts`) and follow established patterns
- [TST1f] Test outcomes, not implementations: assert on outputs, return values, observable behavior—never on internal method calls or implementation details; refactor-resilient tests are required

## [CP1] Task Completion Protocol

- [CP1a] After implementing changes, offer to help verify the fix with concrete commands and checks
- [CP1b] Request explicit user confirmation that the issue is resolved before cleanup or commits
- [CP1c] After confirmation, remove temporary files you created (temp files go in `/tmp`, never committed) and (if user wants a commit) create a single, descriptive commit
- [CP1d] Before creating a commit, state the exact files that will be included and wait for confirmation

## [LG1] Language Consistency

- [LG1a] All code, comments, docs, and commit messages must use American English spelling
- [LG1b] If British spelling is detected, correct it immediately

---

### Meta

## [ORG] Document Organization

- [ORG1] Purpose: `AGENTS.md` is the enforcement surface and index; keep every critical rule referenceable by short hashes; `docs/agents/` must not exist
- [ORG2] Structure: succinct hashed rules ordered by priority (Foundational -> Blocking -> Code Quality -> Domain-Specific -> Process & Tooling -> Meta); supporting `docs/` explain HOW/WHY (<= 350 LOC each)
- [ORG3] Usage: cite hashes when giving guidance; add new hashes in logical order without renumbering
- [ORG4] One Hash, One Rule: each `[XX#x]` bullet is a single, succinct rule statement
- [ORG5] Directive language: rules use imperative/prohibitive phrasing ("do X", "no Y", "never Z"); avoid discretionary hedges ("prefer", "consider", "try to", "ideally", "when possible")

## [DOC1] Documentation Architecture

- [DOC1a] No doc barrels: do not create docs whose primary purpose is listing other docs. Every doc must be substantive.
- [DOC1b] Prerequisite reading: when a workflow requires a doc to be read first, the rule MUST name the exact doc path
- [DOC1c] When you create/delete/move/significantly change files, update: `docs/architecture/README.md`, `docs/file-map.md`, and the relevant `docs/features/[domain].md` or `docs/architecture/[domain].md`
- [DOC1d] Verify changes do not violate documented architecture/patterns; fix stale docs immediately

## [APP] Reference Contracts

- **Code Change Policy**: `docs/standards/code-change.md` ([LC1], [MO1], [FS1])
- **Framework Evidence**: `docs/standards/nextjs-framework.md` ([FW1])
- **Type Policy**: `docs/standards/type-policy.md` ([TS1])
- **Testing Protocols**: `docs/standards/testing.md` ([TST1])
- **Deployment**: `docs/ops/verification.md` ([DEP1])
- **Image Optimization Contract**: `docs/architecture/image-handling.md#image-optimization-decision-matrix` ([IMG1])
