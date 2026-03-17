# Resolve All `bun run validate` Errors — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all 543 ast-grep violations (170 errors, 373 warnings) so `bun run validate` passes clean.

**Architecture:** The validate pipeline runs: `format → lint:ox → lint:es → check:duplicate-types → lint:ast-grep → guard:runtime-json-s3-ops → type-check → analyze-circular-deps`. Currently ast-grep blocks with 170 errors (the remaining gates already pass independently). All violations come from custom rules in `rules/ast-grep/`. Fixes are purely local refactors — no API/schema contract changes.

**Tech Stack:** TypeScript, Next.js 16, Zod v4, ast-grep, Vitest

**Validation command:** `bun run validate` (must reach 0 errors AND 0 warnings)

**Execution strategy:** Fix errors first (they block the gate), then warnings. Within each severity, batch by rule type for consistency. After each task, run `bun run lint:ast-grep 2>&1 | grep -cE '^(error|warning)\['` to confirm count reduction.

---

## Priority Order

Errors are blocking. Warnings are not blocking but must also reach zero per [TS1f]. Work errors first in dependency order (types before consumers), then warnings.

| Priority | Rule                         | Severity | Count | Task    |
| -------- | ---------------------------- | -------- | ----- | ------- |
| 1        | `types-are-not-schemas`      | error    | 33    | Task 1  |
| 2        | `no-reexports`               | error    | 32    | Task 2  |
| 3        | `no-catch-return-fallback`   | error    | 44    | Task 3  |
| 4        | `no-generic-variable-names`  | error    | 20    | Task 4  |
| 5        | `no-unsafe-casts`            | error    | 11    | Task 5  |
| 6        | `no-zod-loose-types`         | error    | 11    | Task 6  |
| 7        | `no-silent-catch`            | error    | 6     | Task 7  |
| 8        | `no-record-string-unknown`   | error    | 6     | Task 8  |
| 9        | `no-default-unknown-generic` | error    | 6     | Task 9  |
| 10       | `no-double-zod-validation`   | error    | 1     | Task 10 |
| 11       | `no-magic-literals`          | warning  | 197   | Task 11 |
| 12       | `no-legacy-code`             | warning  | 49    | Task 12 |
| 13       | `no-domain-record-cast`      | warning  | 43    | Task 13 |
| 14       | `ban-generic-type-suffixes`  | warning  | 37    | Task 14 |
| 15       | `domain-types-in-schemas`    | warning  | 36    | Task 15 |
| 16       | `no-anemic-type-alias`       | warning  | 11    | Task 16 |

---

## Chunk 1: Error-Level Type & Schema Violations (Tasks 1, 6, 8, 9, 10)

These tasks touch `src/types/` and schema files. Do them first because later tasks (re-exports, renames) depend on stable type names.

### Task 1: Fix `types-are-not-schemas` (33 errors)

**Rule:** Type aliases must not end in `Schema`. Reserve `*Schema` for the Zod runtime object; name the inferred type after the entity itself.

**Pattern:** `type FooSchema = z.infer<typeof FooSchema>` → `type Foo = z.infer<typeof FooSchema>`

**Files (grouped by module):**

- `src/types/schemas/github-storage.ts` (9 violations: lines 16, 25, 38, 54, 63, 88, 97, 113, 121)
- `src/types/seo/schema.ts` (10 violations: lines 22, 34, 45, 73, 92, 110, 131, 146, 177, 196)
- `src/types/schemas/related-content.ts` (4 violations: lines 21, 38, 54, 99)
- `src/types/schemas/book.ts` (3 violations: lines 264, 268, 281)
- `src/types/schemas/image-manifest.ts` (3 violations: lines 14, 18, 22)
- `src/types/schemas/rate-limit.ts` (2 violations: lines 13, 17)
- `src/types/features/software.ts` (1 violation: line 46)
- `src/types/lib.ts` (1 violation: line 310)

**Steps per file:**

- [ ] **Step 1:** Read the file. For each `type XSchema = z.infer<typeof XSchema>`, rename the type alias to `type X = z.infer<typeof XSchema>`.
- [ ] **Step 2:** Search all importers of the old type name: `grep -r 'XSchema' src/ --include='*.ts' --include='*.tsx'`. Update every import to use the new name `X`.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'types-are-not-schemas' | wc -l` — expected: decreasing toward 0.
- [ ] **Step 4:** After all files done, run `bun run type-check` to confirm no type errors introduced.
- [ ] **Step 5:** Commit: `fix(types): rename *Schema type aliases to entity names [types-are-not-schemas]`

**Caution:** The Zod _object_ keeps its `Schema` suffix (e.g., `const FooSchema = z.object({...})`). Only the `type` alias gets renamed. After renaming, every import site that used `type FooSchema` must be updated to `type Foo`.

---

### Task 6: Fix `no-zod-loose-types` (11 errors)

**Rule:** No `z.json()`, `z.looseObject()`, or `.passthrough()`. Use strict `z.object()` (Zod v4 strips extra keys by default).

**Files:**

- `src/types/schemas/ai-openai-compatible-client.ts` (8 violations: lines 10, 18, 40, 49, 59, 67, 94, 102)
- `src/types/schemas/bookmark.ts` (1 violation: line 268)
- `src/types/error.ts` (1 violation: line 128)
- `src/types/seo/opengraph.ts` (1 violation: line 105)

**Steps:**

- [ ] **Step 1:** Read each file. For each `.passthrough()`, remove it (Zod v4 `z.object()` is strict by default). For each `z.looseObject(...)`, replace with `z.object(...)`. For each `z.json(...)`, replace with the canonical schema for the field's actual shape (e.g., `z.object({...})` or `z.array(z.string())`).
- [ ] **Step 2:** For `ai-openai-compatible-client.ts`: these are OpenAI-compatible API response schemas. The `.passthrough()` calls likely exist because the API returns extra fields. Remove `.passthrough()` and explicitly define the fields we actually use. Extra fields will be stripped by Zod v4 automatically.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-zod-loose-types'` — expected: 0.
- [ ] **Step 4:** Run `bun run type-check` to confirm.
- [ ] **Step 5:** Commit: `fix(schemas): remove passthrough/looseObject/json from Zod schemas [no-zod-loose-types]`

---

### Task 8: Fix `no-record-string-unknown` (6 errors)

**Rule:** No `Record<string, unknown>` type annotations. Use the canonical typed contract or an explicit `{ field: Type }` shape.

**Files:**

- `src/components/features/blog/blog-article/mdx-content.client.tsx:120`
- `src/lib/db/mutations/bookmark-embeddings.ts:50`
- `src/lib/db/mutations/investment-embeddings.ts:46`
- `src/lib/db/queries/image-manifests.ts:47`
- `src/lib/utils/api-sanitization.ts:37`
- `src/lib/utils/json-utils.ts:257`

**Steps:**

- [ ] **Step 1:** Read each file and understand what the `Record<string, unknown>` represents.
- [ ] **Step 2:** Replace with the actual domain type, an explicit object shape, or `JsonValue` (from a Zod schema) depending on context. For DB mutation params, use the column types from the schema. For API sanitization, use the specific request/response type.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-record-string-unknown'` — expected: 0.
- [ ] **Step 4:** Run `bun run type-check`.
- [ ] **Step 5:** Commit: `fix(types): replace Record<string, unknown> with domain types [no-record-string-unknown]`

---

### Task 9: Fix `no-default-unknown-generic` (6 errors)

**Rule:** No `<T = unknown>` generic defaults. Require callers to supply the generic explicitly, or return a concrete type.

**Files:**

- `src/types/cache.ts:86`
- `src/types/component-types.ts:200`
- `src/types/graphql.ts:17`
- `src/types/lib.ts:203`
- `src/types/lib.ts:299`
- `src/types/lib.ts:427`

**Steps:**

- [ ] **Step 1:** Read each file. For each `type Foo<T = unknown>` or `interface Foo<T = unknown>`, determine what `T` actually represents at call sites.
- [ ] **Step 2:** Either (a) remove the default and require callers to supply the generic, (b) change the default to the actual concrete type used by most callers, or (c) use `JsonValue` if the generic truly represents arbitrary JSON.
- [ ] **Step 3:** Update all call sites that relied on the `= unknown` default to explicitly pass the generic.
- [ ] **Step 4:** Run `bun run lint:ast-grep 2>&1 | grep 'no-default-unknown-generic'` — expected: 0.
- [ ] **Step 5:** Run `bun run type-check`.
- [ ] **Step 6:** Commit: `fix(types): remove unknown generic defaults [no-default-unknown-generic]`

---

### Task 10: Fix `no-double-zod-validation` (1 error)

**Rule:** Don't call `.parse()` or `.safeParse()` on the same payload twice. Parse once at the trust boundary.

**File:** `src/lib/ai/openai-compatible/openai-compatible-client.ts:113`

**Steps:**

- [ ] **Step 1:** Read the file. Find where the same payload is parsed twice.
- [ ] **Step 2:** Remove the second parse call. Pass the already-typed result from the first parse downstream.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-double-zod-validation'` — expected: 0.
- [ ] **Step 4:** Commit: `fix(ai): remove double Zod validation [no-double-zod-validation]`

---

## Chunk 2: Error-Level Code Quality Violations (Tasks 2, 3, 4, 5, 7)

### Task 2: Fix `no-reexports` (32 errors)

**Rule:** No `export { X } from`, `export * from`, or `export type { X } from`. Every consumer must import directly from the source module.

**Files (32 re-export statements across these files):**

Type re-export files:

- `src/types/accelerator.ts` (2)
- `src/types/ai-openai-compatible.ts` (1)
- `src/types/bookmark.ts` (2)
- `src/types/education.ts` (2)
- `src/types/error.ts` (1)
- `src/types/experience.ts` (2)
- `src/types/lib.ts` (1)
- `src/types/search.ts` (2)
- `src/types/seo.ts` (2)
- `src/types/seo/metadata.ts` (1)
- `src/types/terminal.ts` (1)

Library re-export files:

- `src/lib/ai-analysis/types.ts` (1)
- `src/lib/ai/rag/index.ts` (1)
- `src/lib/batch-processing/index.ts` (1)
- `src/lib/bookmarks/tag-resolver.ts` (1)
- `src/lib/books/audiobookshelf.server.ts` (1)
- `src/lib/constants/cli-flags.ts` (1)
- `src/lib/content-graph/blended-scoring.ts` (1)
- `src/lib/cv/cv-data.ts` (1)
- `src/lib/data-access/github-public-api.ts` (1)
- `src/lib/db/embedding-input-contracts.ts` (1)
- `src/lib/db/queries/cross-domain-similarity.ts` (1)
- `src/lib/db/queries/discovery-tag-taxonomy.ts` (1)
- `src/lib/db/queries/hybrid-search-books-blog.ts` (1)
- `src/lib/db/queries/hybrid-search-investments.ts` (1)
- `src/lib/db/schema/content-embeddings.ts` (1)

**Steps (per re-export statement):**

- [ ] **Step 1:** Read the file containing the re-export. Identify the source module and the exported symbol.
- [ ] **Step 2:** Search all consumers that import this symbol from the re-exporting file: `grep -rn 'from "path/to/reexporter"' src/ --include='*.ts' --include='*.tsx'`
- [ ] **Step 3:** Update each consumer to import directly from the source module.
- [ ] **Step 4:** Remove the re-export line from the file.
- [ ] **Step 5:** After all 32 are done, run `bun run lint:ast-grep 2>&1 | grep 'no-reexports'` — expected: 0.
- [ ] **Step 6:** Run `bun run type-check`.
- [ ] **Step 7:** Commit: `fix(imports): replace re-exports with direct imports [no-reexports]`

**Caution:** This task has the highest blast radius — every removed re-export requires updating all downstream importers. Map all consumers BEFORE removing any re-export. Do type files first (they tend to have more consumers), then library files.

---

### Task 3: Fix `no-catch-return-fallback` (44 errors)

**Rule:** `catch` blocks must not silently return fallback values (`null`, `undefined`, `false`, `[]`, `{}`). Either log with context and rethrow, or return a typed error contract.

**Files (44 violations across ~35 files):**

Scripts (6):

- `scripts/bookmark-diagnostics.ts` (4 violations)
- `scripts/lib/indexnow-submit.ts` (1)
- `scripts/sync-blog-cover-images.ts` (1)

API routes (5):

- `src/app/api/ai/chat/[feature]/sse-stream.ts` (2)
- `src/app/api/cache/images/route.ts` (1)
- `src/app/api/search/bookmarks/route.ts` — caught by `no-silent-catch`
- `src/app/bookmarks/[slug]/page.tsx` (1)
- `src/app/projects/page.tsx` (2)

Components (4):

- `src/components/features/projects/project-card.client.tsx` (1)
- `src/components/features/projects/project-detail.tsx` (1)
- `src/components/features/related-content/related-content.server.tsx` (1)
- `src/components/ui/logo-image.client.tsx` (1)

Library code (25+):

- `src/lib/blog/mdx.ts` (4)
- `src/lib/bookmarks/bookmarks.client.ts` (1)
- `src/lib/bookmarks/enrich-opengraph.ts` (1)
- `src/lib/bookmarks/normalize.ts` (1)
- `src/lib/bookmarks/slug-manager.ts` (1)
- `src/lib/books/image-utils.server.ts` (1)
- `src/lib/data-access/logos.ts` (1)
- `src/lib/db/queries/query-embedding.ts` (1)
- `src/lib/image-handling/image-s3-utils.ts` (2)
- `src/lib/og-image/fetch-image.ts` (1)
- `src/lib/opengraph/fetch.ts` (1)
- `src/lib/persistence/image-persistence.ts` (1)
- `src/lib/search/loaders/dynamic-content.ts` (1)
- `src/lib/search/searchers/tag-search.ts` (3)
- `src/lib/services/image-streaming.ts` (1)
- `src/lib/services/image/logo-fetcher.ts` (1)
- `src/lib/services/image/logo-validators.ts` (1)
- `src/lib/services/unified-image-service.ts` (1)
- `src/lib/utils/cdn-utils.ts` (1)
- `src/lib/utils/json-utils.ts` (2)
- `src/lib/ai/rag/dynamic-retriever.ts` (1)

**Fix pattern (choose per context):**

Option A — Log and rethrow (for errors that should propagate):

```typescript
} catch (error: unknown) {
  console.error("[moduleName] operation failed:", error);
  throw error;
}
```

Option B — Log and return typed error (for operations that have a valid "not found" path):

```typescript
} catch (error: unknown) {
  console.error("[moduleName] operation failed:", error);
  return { success: false, error: String(error) } as const;
}
```

Option C — For page/component `catch` blocks where a fallback IS the correct UX (e.g., `notFound()`), add a `console.error` before the fallback return so the catch is no longer silent.

**Steps:**

- [ ] **Step 1:** For each file, read the catch block and determine which fix pattern applies.
- [ ] **Step 2:** Apply the fix. Every catch block must either (a) log + rethrow, (b) log + return a typed error, or (c) log + return fallback with visible logging.
- [ ] **Step 3:** Batch by subdirectory — do all `scripts/` first, then `src/app/`, then `src/components/`, then `src/lib/`.
- [ ] **Step 4:** After each batch, run `bun run lint:ast-grep 2>&1 | grep 'no-catch-return-fallback' | wc -l`.
- [ ] **Step 5:** Run `bun run type-check` after all fixes.
- [ ] **Step 6:** Commit per batch: `fix(scripts): add error logging to catch blocks [no-catch-return-fallback]`, etc.

---

### Task 4: Fix `no-generic-variable-names` (20 errors)

**Rule:** Variables named `data` must be renamed to an intent-revealing domain name.

**Files (20 violations):**

- `src/app/bookmarks/error.tsx:39` — rename `data` to bookmark-related name
- `src/app/status/page.tsx:48` — rename to `healthMetrics`
- `src/components/features/bookmarks/discover-feed.client.tsx:31` — rename to `feedResponse` or `bookmarkFeed`
- `src/components/ui/terminal/commands.client.ts:30,86` — rename to domain name
- `src/hooks/use-ai-analysis.ts:200` — rename to `analysisResponse`
- `src/lib/ai-analysis/reader.server.ts:57` — rename to `analysisResult`
- `src/lib/ai/openai-compatible/browser-client.ts:39,259` — rename to `chatResponse` / `streamChunk`
- `src/lib/bookmarks/api-client.ts:31` — rename to `bookmarkResponse`
- `src/lib/bookmarks/refresh-helpers.ts:134` — rename to `refreshResult`
- `src/lib/books/audiobookshelf.server.ts:104,316` — rename to `audiobookResponse`
- `src/lib/books/related-content.server.ts:56,65,79` — rename to `relatedBooks` / `relatedPosts`
- `src/lib/data-access/github-commit-counts.ts:41` — rename to `commitCounts`
- `src/lib/data-access/github-csv-repair.ts:161` — rename to `repairedCsv`
- `src/lib/data-access/github-storage.ts:37` — rename to `storageResponse`
- `src/lib/utils/http-client.ts:227` — rename to `httpResponse`

**Steps:**

- [ ] **Step 1:** Read each file. Determine what `data` actually represents in context.
- [ ] **Step 2:** Rename `data` to a domain-specific name. Update all references within the same scope.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-generic-variable-names'` — expected: 0.
- [ ] **Step 4:** Run `bun run type-check`.
- [ ] **Step 5:** Commit: `fix(naming): rename generic data variables to domain names [no-generic-variable-names]`

---

### Task 5: Fix `no-unsafe-casts` (11 errors)

**Rule:** No `as unknown as T` double-casts, no `JSON.parse(...) as T`, no `.json() as T`. Use Zod `safeParse()` for external data; fix types upstream for internal code.

**Files:**

- `src/app/api/cv/pdf/route.tsx:29` — `.json() as T`
- `src/components/features/cv/CvPdfDocument.tsx:29` — likely same pattern
- `src/components/ui/terminal/terminal-context.client.tsx:58`
- `src/lib/blog/mdx.ts:205,437` — `as unknown as` double-casts
- `src/lib/search/searchers/tag-search.ts:43`
- `src/lib/services/image-streaming.ts:96`
- `src/lib/services/image/logo-fetcher.ts:218`
- `src/lib/utils/csv.ts:48`
- `src/lib/utils/error-utils.ts:204,206`

**Steps:**

- [ ] **Step 1:** Read each file. Determine whether the cast is on external data (needs Zod) or internal mismatch (needs type fix upstream).
- [ ] **Step 2:** For external data (`response.json()`, `JSON.parse()`): create or reuse a Zod schema and use `.safeParse()` or `.parse()`.
- [ ] **Step 3:** For internal mismatches (`as unknown as Stats`): fix the type at the source so the cast is unnecessary.
- [ ] **Step 4:** Run `bun run lint:ast-grep 2>&1 | grep 'no-unsafe-casts'` — expected: 0.
- [ ] **Step 5:** Run `bun run type-check`.
- [ ] **Step 6:** Commit: `fix(types): replace unsafe casts with Zod parsing or upstream type fixes [no-unsafe-casts]`

---

### Task 7: Fix `no-silent-catch` (6 errors)

**Rule:** Catch blocks with a bare `return null/undefined/[]/{}` and no logging are prohibited. Add logging or use `safe*` naming convention.

**Files:**

- `src/app/api/search/bookmarks/route.ts:116`
- `src/app/bookmarks/[slug]/page.tsx:58`
- `src/components/features/books/book-detail.tsx:63`
- `src/components/features/related-content/related-content-card.tsx:22`
- `src/lib/ai/openai-compatible/gate-token.ts:72`
- `src/lib/search/serialization.ts:66`

**Steps:**

- [ ] **Step 1:** Read each file. Add a `console.error("[context]", error)` call before the return.
- [ ] **Step 2:** If the function intentionally swallows errors (e.g., URL parsing), rename to `safe*` prefix.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-silent-catch'` — expected: 0.
- [ ] **Step 4:** Commit: `fix(error-handling): add logging to silent catch blocks [no-silent-catch]`

---

## Chunk 3: Warning-Level Violations (Tasks 11–16)

### Task 11: Fix `no-magic-literals` (197 warnings)

**Rule:** Numeric literals in comparisons/subscripts must be extracted to named constants. Allowed: `0`, `1`, `-1`.

**Top files by violation count:**

- `src/lib/image-handling/edge-compatible-probe.ts` (51 violations — byte-level image format detection)
- `src/lib/image-handling/image-analysis.ts` (18)
- `src/components/features/github/github-activity.client.tsx` (11)
- `src/lib/seo/og-validation.ts` (10)
- `src/lib/image-handling/image-compare.ts` (8)
- `src/lib/data-access/github-repo-stats.ts` (7)
- ~40 other files with 1–6 violations each

**Strategy:** Group constants by domain. For image byte magic numbers, create constants like `PNG_SIGNATURE`, `JPEG_SOI_MARKER`, `GIF_HEADER_SIZE`. For SEO limits, use `MAX_TITLE_LENGTH`, `MAX_DESCRIPTION_LENGTH`. For thresholds, use `SCORE_DIFF_THRESHOLD`, `CACHE_TTL_MINUTES`, etc.

**Steps:**

- [ ] **Step 1:** Start with the highest-violation file (`edge-compatible-probe.ts`). Read it, identify all magic numbers, create named constants at the top of the file or in a shared constants file if reused.
- [ ] **Step 2:** Work through each file group. For each magic number, create a `const` with an intent-revealing name.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-magic-literals' | wc -l` after each file group.
- [ ] **Step 4:** Commit per domain batch: `fix(image): extract magic numbers to named constants [no-magic-literals]`, `fix(seo): extract magic numbers [no-magic-literals]`, etc.

**Caution:** This is the highest-count task. Prioritize the big files first for maximum count reduction. Don't create a single mega-constants file — keep constants near their usage per [MO1d].

---

### Task 12: Fix `no-legacy-code` (49 warnings)

**Rule:** Identifiers containing `Legacy`, `Deprecated`, or `Old` are flagged. Rename or delete.

**Steps:**

- [ ] **Step 1:** For each flagged identifier, determine if the "legacy" code path is still needed.
- [ ] **Step 2:** If still needed: rename to describe actual purpose (e.g., `findAndMigrateLegacyLogo` → `findUnhashedLogo`).
- [ ] **Step 3:** If no longer needed: delete the code and all references.
- [ ] **Step 4:** Update all call sites for renames.
- [ ] **Step 5:** Run `bun run lint:ast-grep 2>&1 | grep 'no-legacy-code' | wc -l` — expected: 0.
- [ ] **Step 6:** Run `bun run type-check`.
- [ ] **Step 7:** Commit: `refactor: rename legacy identifiers to domain-specific names [no-legacy-code]`

---

### Task 13: Fix `no-domain-record-cast` (43 warnings)

**Rule:** No `$expr as Record<string, ...>` casts. Use the real domain type or parse at the trust boundary.

**Steps:**

- [ ] **Step 1:** Read each violation site. Determine the actual shape of the data.
- [ ] **Step 2:** Replace `as Record<string, unknown>` with either (a) the domain type import, (b) a Zod parse at the boundary, or (c) a type guard.
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'no-domain-record-cast' | wc -l` — expected: 0.
- [ ] **Step 4:** Commit: `fix(types): replace Record<string,...> casts with domain types [no-domain-record-cast]`

---

### Task 14: Fix `ban-generic-type-suffixes` (37 warnings)

**Rule:** Type/interface names must not end in `Data`, `Info`, `Object`, `Item`, `Wrapper`, `Holder`, `Container`.

**Steps:**

- [ ] **Step 1:** For each flagged type, determine a domain-specific name. E.g., `BookData` → `Book` or `BookDetail`; `ErrorInfo` → `ErrorDetail` or `DiagnosticError`.
- [ ] **Step 2:** Rename the type and update ALL importers/consumers (use grep to find every usage).
- [ ] **Step 3:** Run `bun run lint:ast-grep 2>&1 | grep 'ban-generic-type-suffixes' | wc -l` — expected: 0.
- [ ] **Step 4:** Run `bun run type-check`.
- [ ] **Step 5:** Commit: `refactor(types): rename generic-suffix types to domain names [ban-generic-type-suffixes]`

**Caution:** High blast radius — type renames propagate to every import site. Map all consumers before renaming.

---

### Task 15: Fix `domain-types-in-schemas` (36 warnings)

**Rule:** Type names must not end in `DTO`, `Data`, `Info`, `Payload`, `Response`, `Request`, `Utils`, `Helper`, `Common`, `Manager`, `Impl`, `Row`, `Record`, `ListItem`, `Mutation`, `Query`. Use domain-centric naming.

**Steps:**

- [ ] **Step 1:** Identify each flagged type and its domain concept.
- [ ] **Step 2:** Rename using the prescribed pattern: projections as `{Domain}Ref`/`{Domain}Brief`/`{Domain}Detail`; inputs as `Create{Domain}`/`Update{Domain}`.
- [ ] **Step 3:** Update all importers.
- [ ] **Step 4:** Run `bun run lint:ast-grep 2>&1 | grep 'domain-types-in-schemas' | wc -l` — expected: 0.
- [ ] **Step 5:** Run `bun run type-check`.
- [ ] **Step 6:** Commit: `refactor(types): apply domain-centric naming to schema types [domain-types-in-schemas]`

**Note:** Tasks 14 and 15 overlap on `Data` suffix. Do Task 14 first, then Task 15 will have fewer remaining violations.

---

### Task 16: Fix `no-anemic-type-alias` (11 warnings)

**Rule:** No `export type X = Y` where both are plain identifiers (pure renames with no transformation).

**Steps:**

- [ ] **Step 1:** For each alias, determine if it adds semantic value or is just a rename.
- [ ] **Step 2:** If pure rename: update all consumers to use the original type directly, then delete the alias.
- [ ] **Step 3:** If it narrows/picks/omits: convert to `Pick<T, K>` or `Omit<T, K>`.
- [ ] **Step 4:** Run `bun run lint:ast-grep 2>&1 | grep 'no-anemic-type-alias' | wc -l` — expected: 0.
- [ ] **Step 5:** Commit: `refactor(types): remove anemic type aliases [no-anemic-type-alias]`

---

## Final Verification

- [ ] **Step 1:** Run `bun run validate` — expected: exits 0 with no errors or warnings from ast-grep.
- [ ] **Step 2:** Run `bun run type-check` — expected: passes clean.
- [ ] **Step 3:** Run `bun run test` — expected: all tests pass (no behavior changes).
- [ ] **Step 4:** Run `bun run build` — expected: builds successfully.

---

## Parallelization Guide

These task groups are independent and can be worked on by separate agents:

- **Group A (Types):** Tasks 1, 6, 8, 9, 10, 16 — all in `src/types/`
- **Group B (Re-exports):** Task 2 — cross-cutting but purely import-path changes
- **Group C (Error handling):** Tasks 3, 7 — catch block modifications
- **Group D (Naming):** Tasks 4, 12, 14, 15 — variable/type renames
- **Group E (Casts):** Tasks 5, 13 — replacing casts with proper types
- **Group F (Constants):** Task 11 — magic literal extraction

**Dependency:** Task 1 (type renames) should complete before Task 2 (re-exports) to avoid renaming already-moved imports. Tasks 14 and 15 share the `Data` suffix overlap — do 14 first.
