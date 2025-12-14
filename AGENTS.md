---
description: "williamcallahan.com agent rules - ZERO TEMPERATURE development with mandatory verification, type safety, and safe git workflows"
alwaysApply: true
---

# williamcallahan.com Agent Rules

## Document Organization [ORG]

- [ORG1] Purpose: keep every critical rule within the first ~250 lines; move long examples/config to Appendix.
- [ORG2] Structure: Rule Summary first, then detailed sections keyed by short hashes (e.g., `[GT1a]`).
- [ORG3] Usage: cite hashes when giving guidance or checking compliance; add new rules without renumbering older ones.

## Rule Summary [SUM]

- [ZT1a-g] ZERO TEMPERATURE: evidence-first, no assumptions, halt-on-uncertainty
- [CM1a-b] Communication: no filler; investigate then cite evidence
- [GT1a-j] Git safety: no history rewrite/destructive ops; no lock deletion; no hook/signing bypass; no AI attribution
- [CMD1a-d] Command execution guardrails: retry with escalation; no inference cleanup
- [FS1a-f] File creation & edit discipline: existing-first, permission required, clean code/architecture, dedupe
- [SZ1a-b] File size limit (500 LOC) & refactor gating
- [UP1a-d] Comprehensive update protocol: update _all_ usages (imports/calls/types/tests/docs)
- [TS1a-f] Type safety & validation: no `any`, no suppression, Zod at boundaries
- [SC1a-d] Schema/type organization: Zod schemas are the source of truth
- [PL1a-c] No polyfills/global patches in modern code; prefer native APIs
- [BP1a-c] No boilerplate/tutorial code or placeholder implementations
- [AR1a-e] Mandatory pre-task workflow: why-first, architecture docs, types, search, version verification
- [DOC1a-b] Docs sync: update architecture docs with code changes
- [FW1a-f] Next.js/React/Jest enforcement: package.json is law; node_modules verification + MCP docs required
- [DEP1a-d] Cloudflare cache: deployment verification workflow
- [VR1a-g] Verification loops: validate/lint/type-check/build/test (and deploy readiness)
- [TST1a-e] Testing protocols: use `bun run test*`, never `bun test`
- [CP1a-d] Task completion: verify -> request confirmation -> cleanup/commit (no AI attribution)
- [TMP1a-c] Temporary files: /tmp only, cleanup after user confirmation
- [ENV1a-c] Environment variables: no new required vars without explicit approval
- [LG1a-b] Language: American English only

## [ZT1] ZERO TEMPERATURE: Evidence, No Assumptions, Halt Protocol

- [ZT1a] Assumptions are violations. Verify by reading the codebase and docs first.
- [ZT1b] Source of truth order: repo code/docs -> `package.json` versions -> `node_modules/` sources -> MCP/live docs (capture the URL/reference).
- [ZT1c] If you cannot support a claim with a concrete source (file path or doc), stop and investigate before proceeding.
- [ZT1d] If a zero-tolerance violation is present (or would be introduced), stop, alert the user with specifics, and wait for instruction.
- [ZT1e] Why-first mandate: state the precise reason for change before editing behavior; keep a working note; update docstrings/JSDoc when intent changes.
- [ZT1f] Real-time verification: when referencing an imported function/type/config, read its source definition now; do not rely on memory.
- [ZT1g] Assumptions policy (examples): never assume API behavior, type definitions, existing functionality, file contents, or breaking changes—verify.

## [CM1] Communication Standards (Truth Through Verification)

- [CM1a] Do not use empty confirmations (“You’re right”, “Absolutely”) before investigation.
- [CM1b] Prefer “Let me verify by checking …” and cite specific files/paths when responding.

## [GT1] Git & Repo Safety

- [GT1a] Emergency brake: never run `git commit --amend` unless the user provides the exact command verbatim.
- [GT1b] Never run history-rewriting or destructive git commands unless the user provides the exact command verbatim.
  - Examples: `git reset --hard`, `git reset --soft`, `git reset --mixed`, `git rebase`, `git push --force`, `git push --force-with-lease`, `git restore`, `git clean -fd`, `git stash`, `git stash drop`.
- [GT1c] Do not switch branches (`git checkout` / `git switch`) or alter branch history unless explicitly instructed.
- [GT1d] Never delete lock files (e.g., `.git/index.lock`, `.git/next-index-*.lock`). Surface the error and ask.
- [GT1e] Do not bypass hooks or commit signing; no `--no-verify`, no disabling signing, no `HUSKY=0` / `SKIP_HUSKY=1`.
- [GT1f] Treat pre-existing staged/unstaged changes as intentional; do not unstage/restage/revert “cleanup” unless the user gives the exact command.
- [GT1g] If an unexpected file is staged or modified by hooks, pause and show the diff; do not attempt to “fix” it unprompted.
- [GT1h] Commit messages: one logical change per commit; describe change + purpose; no AI/tool attribution (e.g., no “Generated with [Claude Code]”); no `Co-authored-by` lines.
- [GT1i] If your tooling supports explicit elevation/authorization for git, use it (e.g., `with_escalated_permissions=true`); otherwise stop and ask before running git commands.
- [GT1j] Never skip documented repo workflows (hooks, signing, CI gates) to “get unstuck”.

## [CMD1] Command Execution Guardrails

- [CMD1a] If a command fails due to permissions/locks, retry the same command with elevated permissions _first_ (if supported — e.g., `with_escalated_permissions=true`) and include a one-sentence justification before attempting alternatives.
- [CMD1b] Never perform destructive file operations (deleting `.git/`, removing lock files, mass deletes) without explicit, quoted user instruction.
- [CMD1c] No inference-driven cleanup. Surface the exact command + error output and wait if the retry fails.
- [CMD1d] When unsure whether an action is destructive, stop and ask.

## [FS1] File Creation & Edit Discipline

- [FS1a] Prefer editing existing files; do not create new files unless necessary for the task goal.
- [FS1b] Before creating any file: search exhaustively -> analyze existing solutions -> confirm no extension path -> request explicit permission.
- [FS1c] Read the entire target file before editing; integrate changes with existing structure (don’t blindly append).
- [FS1d] Clean code: single-responsibility changes; follow SOLID/DRY best practices; no dead code; no empty try/catch blocks that swallow errors.
- [FS1e] Clean architecture: dependencies point inward; domain logic must not import from UI/framework layers.
- [FS1f] Efficiency mandate: nearly all edits should result in the same or fewer lines by removing duplication/redundant logic.

## [SZ1] File Size Limit

- [SZ1a] 500 lines is a hard maximum for a single file.
- [SZ1b] If a file approaches the limit, stop adding features and extract cohesive modules (create a refactor task if needed).

## [UP1] Comprehensive Code Update Protocol

- [UP1a] Any API/type/function change requires mapping _all_ usages first (imports, call sites, type references, tests, docs).
- [UP1b] During the change, track and update every usage systematically; missing one usage is a correctness failure.
- [UP1c] After the change, audit for leftovers (search for old names/patterns) and run the verification loops.
- [UP1d] Final rule: an update is not complete until every usage has been updated and verified.

## [TS1] Type Safety & No Suppression

- [TS1a] Type safety is absolute: no implicit `any`, no `any`, no unguarded `unknown`.
- [TS1b] Never use `@ts-ignore`, `eslint-disable`, `@SuppressWarnings`, or similar suppression to bypass correctness; fix the root cause.
- [TS1c] All external/IO data must be validated at the boundary (Zod schemas).
- [TS1d] Never use type assertions without runtime checks.
- [TS1e] Handle `null`/`undefined` explicitly; do not rely on “it probably exists”.
- [TS1f] `bun run validate` must pass with 0 errors and 0 warnings before considering work complete.

## [SC1] Schema & Type Organization (Zod)

- [SC1a] Zod schemas define types; use `z.infer<>` and do not duplicate schema-backed types manually.
- [SC1b] Convention: schemas in `types/schemas/`; non-schema/shared types in `types/`; transformation/business logic in `lib/`.
- [SC1c] If a schema changes, update all dependent code and docs to keep them consistent.
- [SC1d] In this repo, schemas commonly import Zod via `import { z } from "zod/v4";` (follow existing patterns in `types/schemas/`).

## [PL1] Polyfills & Global Patching (Modern Codebase)

- [PL1a] Do not introduce polyfill dependencies or global patching packages (e.g., `core-js`, `@babel/polyfill`, `react-app-polyfill`, `polyfill.io`, `node-fetch`) without explicit approval.
- [PL1b] Prefer native runtime APIs; if compatibility is required, use ponyfills (import-only) or feature detection/dynamic import—not global mutation (or move work to Server Components/Edge Functions when appropriate).
- [PL1c] If you think a polyfill is required, stop and discuss alternatives before making changes.

## [BP1] Boilerplate / Example Code Prohibition

- [BP1a] Do not paste tutorial/boilerplate/template code. Code must follow this repo’s existing patterns and be purpose-driven.
- [BP1b] Forbidden: placeholder implementations (`// TODO: implement`), generic tutorial-y function names (`handleSubmit`, `processData`), and placeholder text (“Lorem ipsum”).
- [BP1c] If boilerplate/example code is detected, stop and surface the exact file:line and required replacement action.

## [AR1] Mandatory Pre-Task Workflow (Before Any Code Changes)

- [AR1a] Purpose alignment: state the “why” and confirm intended behavior before editing.
- [AR1b] Architecture discovery: read `docs/projects/structure/00-architecture-entrypoint.md`, then the relevant domain doc, any related `.mmd` diagrams, and `docs/projects/file-overview-map.md`.
- [AR1c] Type review: read the relevant definitions in `types/` and `types/schemas/` before changing/adding types.
- [AR1d] Existing-first: search the codebase for existing implementations before writing new ones.
- [AR1e] Version verification: confirm dependency versions via `package.json`; consult `node_modules/<package>/{package.json,README.md,CHANGELOG.md}` and/or source where relevant; for Next/React/Jest specifics, also follow [FW1].

## [DOC1] Documentation & Architecture Sync

- [DOC1a] When you create/delete/move/significantly change files, update:
  - `docs/projects/structure/00-architecture-entrypoint.md`
  - `docs/projects/file-overview-map.md`
  - the relevant `docs/projects/structure/[domain].md`
- [DOC1b] Verify changes do not violate documented architecture/patterns; fix stale docs immediately.

## [FW1] Next.js / React / Jest Enforcement (Evidence Required)

- [FW1a] Treat the exact versions in `package.json` as law until the owner explicitly bumps them.
  - Verify current versions in `package.json` before you act (then confirm via `node_modules/<pkg>/package.json` when needed).
- [FW1b] Before any change touching Next.js/React/Jest behavior, verify by reading relevant `node_modules/` sources; do not rely on memory or blog posts.
- [FW1c] For such tasks, perform at least one MCP lookup (Context7/DeepWiki/Brave) for current guidance and retain the URL/reference in your notes/final answer.
- [FW1d] Required reading: `docs/projects/structure/next-js-16-usage.md` before framework-level changes; update it if your work changes expectations.
- [FW1e] Default expectations: Cache Components + React 19 primitives + modern async params/metadata flows; confirm behavior against `cacheComponents` and related Next internals (see `node_modules/next/dist/server/config.js` and `node_modules/next/dist/server/request/params.js`); reject legacy patterns unless explicitly approved (e.g., `next/legacy/image`, synchronous `cookies()` shims, `unstable_cache*` aliases).
- [FW1f] Jest compliance: any test harness change must reference `config/jest/` and verify the Jest runtime (see `node_modules/jest/package.json`); never add tooling that downgrades Jest APIs or adds polyfills to “make tests pass”.

## [DEP1] Cloudflare Cache — Deployment Verification

- [DEP1a] Cloudflare aggressively caches static assets. Local passing tests ≠ production bundle updated.
- [DEP1b] After deploying a fix, verify the deployed JS bundle contains the change (fetch the chunk and grep for a unique token).
- [DEP1c] If the deployed bundle does not match local, treat it as a Cloudflare cache issue first (purge or wait TTL).
- [DEP1d] Do not proceed with deeper debugging until you confirm the deployed bundle is actually updated.

## [VR1] Verification Loops (Mandatory)

- [VR1a] Validate gate: `bun run validate` (run before and after non-trivial changes; must be clean; no bypass).
- [VR1b] Typecheck: `bun run type-check` (and `bun run type-check:tests` when relevant).
- [VR1c] Lint: `bun run lint` (use stricter variants like `lint:errors` when needed).
- [VR1d] Build: `bun run build` (or `bun run build:only` as appropriate).
- [VR1e] Tests: `bun run test` (or `test:watch`, `test:coverage`, `test:ci`, `test:smoke` as appropriate).
- [VR1f] Formatting: `bun run format` and `bun run format:check`.
- [VR1g] Deployment readiness (when deploying): use `bun run deploy:verify` and/or `bun run deploy:smoke-test`.

## [TST1] Testing Protocols (Jest)

- [TST1a] Never run `bun test` directly. Always use `bun run test*` scripts so Jest loads `config/jest/config.ts`.
- [TST1b] Allowed scripts: `bun run test`, `test:watch`, `test:coverage`, `test:ci`, `test:smoke` (plus scoped variants).
- [TST1c] Direct `bun test` bypasses the project config and causes missing `jest.mock`, module resolution failures, and DOM/JSDOM issues—treat this as a violation.
- [TST1d] Do not “fix” test issues by adding polyfills/downgrading Jest; fix the setup/configuration correctly.
- [TST1e] Keep tests observable and deterministic; if mocking is required, set it up explicitly (do not rely on ambient behavior).

## [CP1] Task Completion & Commit Protocol

- [CP1a] After implementing changes, offer to help verify the fix with concrete commands and checks.
- [CP1b] Request explicit user confirmation that the issue is resolved before cleanup or commits.
- [CP1c] After confirmation, remove the temporary files you created and (if the user wants a commit) create a single, descriptive commit with no AI attribution.
- [CP1d] Before creating a commit, state the exact files that will be included and wait for confirmation (avoid bundling unrelated edits).

## [TMP1] Temporary Files Protocol

- [TMP1a] All temporary scripts/data for debugging must be created in `/tmp`, never committed into the repo.
- [TMP1b] After the user confirms the issue is resolved, remove the temporary files you created.
- [TMP1c] Do not run broad cleanup commands without explicit approval; be specific about what you remove.

## [ENV1] Environment Variable Policy

- [ENV1a] Never introduce new required environment variables (including `NEXT_PUBLIC_*`) without explicit, repeated, affirmative consent.
- [ENV1b] No silent changes to `.env`, `.env-example`, CI/CD secrets, or runtime configs.
- [ENV1c] Approval workflow: document rationale and exact variable names; wait for a direct “yes” before committing code that depends on them.

## [LG1] Language Consistency

- [LG1a] All code, comments, docs, and commit messages must use American English spelling.
- [LG1b] If British spelling is detected, correct it immediately.

## Appendix [APP]

### [CFG1] Project Configuration (Informational; verify in `package.json`)

```yaml
REPO_NAME: williamcallahan.com
GITHUB_URL: https://github.com/WilliamAGH/williamcallahan.com
# Previous docs referenced: https://github.com/williamcallahan/williamcallahan.com
DEFAULT_BRANCH: dev (see refs/remotes/origin/HEAD)

PACKAGE_MANAGER: bun (see package.json#packageManager)
LOCKFILE: bun.lock
PACKAGE_MANAGER_INSTALL: bun install
PACKAGE_MANAGER_ADD: bun add
PACKAGE_MANAGER_REMOVE: bun remove

# Stack (verify in package.json)
FRAMEWORK: Next.js
RUNTIME: Node.js

# Testing
TEST_RUNNER: Jest
JEST_CONFIG_PATH: config/jest/config.ts

# Code quality (verify in package.json)
LINTER: Oxlint + ESLint
FORMATTER: Biome + Prettier
TYPE_CHECKER: TypeScript (tsc)
SCHEMA_LIB: Zod (see zod/v4 usage in types/schemas/)

# Common directories
TYPES_DIR: types/
SCHEMAS_DIR: types/schemas/
DOCS_DIR: docs/
COMPONENTS_DIR: components/
STYLES_DIR: styles/
PUBLIC_DIR: public/
CONFIG_DIR: config/
LIB_DIR: lib/

# CI/CD & deployment (verify)
CI_PROVIDER: GitHub Actions
CDN: Cloudflare
PRODUCTION_URL: https://williamcallahan.com
LOCAL_DEVELOPMENT_URL: http://localhost:3000

COMMON_COMMANDS:
  dev: bun run dev
  build: bun run build
  build_only: bun run build:only
  validate: bun run validate
  lint: bun run lint
  type_check: bun run type-check
  format: bun run format
  tests: bun run test
```

### [VC1] Verification Commands (Quick Reference)

```bash
# Check current dependency versions
cat package.json | jq '.dependencies'

# Find files over ~400 LOC (warning threshold)
find . \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1 > 400' | sort -n

# Search for existing functionality
grep -r "[keyword]" --include="*.ts" --include="*.tsx" .

# Validate the codebase
bun run validate

# Typecheck
bun run type-check

# Tests (never run `bun test` directly)
bun run test

# Review types for a domain
find types/ -name "*.ts" | xargs rg -n "[domain]"
```

### [CUR1] Rules & Architecture Docs Index (Informational)

- Start at `docs/projects/structure/00-architecture-entrypoint.md` to find the relevant domain document.
- If you add additional rule files, include YAML front matter:
  ```yaml
  ---
  description: "Brief, specific description"
  alwaysApply: false
  ---
  ```

### [GIT1] Local Git Setup (Informational; do not run unless asked)

```bash
# Ignore local-only files (skip-worktree)
git update-index --skip-worktree config/csp-hashes.json lib/data/slug-mapping.json

# Unset skip-worktree to pull upstream updates
git update-index --no-skip-worktree config/csp-hashes.json lib/data/slug-mapping.json

# Refresh your local copies from HEAD after unsetting (destructive; run only with explicit instruction)
git restore --source=HEAD -- config/csp-hashes.json lib/data/slug-mapping.json
```

### [DEPX] Cloudflare Bundle Verification Snippet

```bash
# Check whether your code change is present in a deployed chunk (replace placeholders)
curl -s "https://[domain]/_next/static/chunks/[chunk].js" | grep -c "yourUniqueToken"
```

### [DEP2] Cloudflare Cache Purge Options (Informational)

- Cloudflare Dashboard -> Caching -> Purge Everything
- Wait for TTL expiration (can be hours)
- Rebuild/deploy to get new hashed chunk names (Next.js outputs versioned chunk filenames)

### [FWX] Node_modules Evidence Checklist (Examples)

- Next.js config/runtime: `node_modules/next/dist/server/config.js`
- Async params/metadata flows: `node_modules/next/dist/server/request/params.js`
- Image config: `node_modules/next/dist/shared/lib/image-config.js`
- React version: `node_modules/react/package.json`
- Jest runtime: `node_modules/jest/package.json`

### [TSTX] Why `bun run test*` Scripts Are Required (Informational)

- They load `config/jest/config.ts` (direct `bun test` bypasses it).
- They ensure Jest setup files + mocking/globals are applied consistently.
- They prevent common failures (module resolution, jsdom/DOM issues, `jest.mock` problems).

### [CPX] Cleanup & Commit Example (Run only if user asked)

```bash
# Remove temporary files you created in /tmp (be specific)
rm /tmp/<your-temp-file>

# Stage & commit (only if the user explicitly asked for a commit)
git add -A
git commit -m "fix: <specific description>"
```

### [BPX] Boilerplate Violation Template

```text
 CRITICAL VIOLATION DETECTED
Boilerplate/example code found in: [file:line]
Code pattern: [description]
Source: [where it likely came from]
Required action: Manual review and replacement
```

### [SCX] Zod Schema Pattern (Example)

```ts
// types/schemas/example.ts
import { z } from "zod/v4";

export const exampleSchema = z.object({
  id: z.string(),
});

export type Example = z.infer<typeof exampleSchema>;
```

### [UPX] Search Strategies for “Update All Usages” (Examples)

```bash
# Imports
grep -r "import.*Thing" --include="*.ts" --include="*.tsx" .

# Call sites
grep -r "thing(" --include="*.ts" --include="*.tsx" .

# Types
grep -r "Thing" --include="*.ts" --include="*.tsx" .

# Tests
grep -r "Thing" --include="*.test.ts" --include="*.spec.ts" .
```
