# Heuristic Engine Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the dead heuristic similarity engine and its supporting infrastructure, prune orphaned types from `related-content.ts` to comply with [LC1a], and update documentation to reflect the pgvector-only architecture.

**Architecture:** The heuristic engine (`content-similarity/`) loaded ALL content into memory, computed tag/text/domain/recency similarity scores in JavaScript, and ranked candidates client-side. This has been replaced by pgvector ANN search (`findSimilarByEntity`) → blended scoring (`applyBlendedScoring`) → batch hydration (`hydrateRelatedContent`). The engine's modules are now dead code except for one pure utility (`limitByTypeAndTotal`) and the debug route.

**Tech Stack:** Next.js 16 (App Router, PPR), TypeScript, Vitest, pgvector (cosine HNSW), Drizzle ORM

**Clean Code Rules Applied:**

- [BLK10] Dead code → delete
- [CC1b] DRY → single source of truth
- [CC1c] YAGNI → no speculative code
- [YK4] Version control remembers → delete unused
- [LC1a] All files ≤ 350 lines
- [UP1] Comprehensive update protocol → map all usages before changes
- [DOC1c] Update architecture docs when changing files

---

## Pre-conditions

- `bun run build` passes
- `bun run validate` returns 0 errors, 0 warnings
- All active consumers use the pgvector pipeline:
  - Server component (`related-content.server.tsx:215 lines`) → `findSimilarByEntity` → `applyBlendedScoring` → `hydrateRelatedContent`
  - API route (`api/related-content/route.ts:188 lines`) → same pipeline
  - Content graph build (`content-graph/build.ts`) → `findSimilarByEntity` → `applyBlendedScoring`

## Dead Code Inventory (verified via grep)

| Module                                    | Lines | External Consumers                                                                       | Status                          |
| ----------------------------------------- | ----- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| `content-similarity/aggregator.ts`        | 526   | debug route only                                                                         | Dead (after debug route update) |
| `content-similarity/cached-aggregator.ts` | 43    | **ZERO**                                                                                 | Dead now                        |
| `content-similarity/tag-ontology.ts`      | 487   | index.ts only (internal)                                                                 | Dead (after engine delete)      |
| `content-similarity/keyword-extractor.ts` | 524   | index.ts + aggregator.ts only (internal)                                                 | Dead (after engine delete)      |
| `content-similarity/index.ts`             | 292   | debug route (calculateSimilarity, DEFAULT_WEIGHTS); route + server (limitByTypeAndTotal) | Partially dead                  |

## Type Liveness Analysis (`src/types/related-content.ts` — 428 lines, violates [LC1a])

| Type                          | Used By                                                                                                  | Status                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SimilarityCandidate`         | cross-domain-similarity, blended-scoring, content-hydration                                              | **ACTIVE**                                                                   |
| `ScoredCandidate`             | blended-scoring, content-hydration, route, server component                                              | **ACTIVE**                                                                   |
| `HydrationEntry`              | content-hydration                                                                                        | **ACTIVE**                                                                   |
| `RelatedContentType`          | everywhere                                                                                               | **ACTIVE**                                                                   |
| `RelatedContentItem`          | everywhere                                                                                               | **ACTIVE**                                                                   |
| `RelatedContentMetadata`      | content-hydration, components                                                                            | **ACTIVE**                                                                   |
| `RelatedContentProps`         | server component                                                                                         | **ACTIVE**                                                                   |
| `RelatedContentCardProps`     | card component                                                                                           | **ACTIVE**                                                                   |
| `RelatedContentSectionProps`  | section component                                                                                        | **ACTIVE**                                                                   |
| `RelatedContentEntry`         | books/related-content.server.ts, content-graph queries                                                   | **ACTIVE**                                                                   |
| `BooksRelatedContentData`     | books/related-content.server.ts, content-graph queries                                                   | **ACTIVE**                                                                   |
| `SimilarityWeights`           | heuristic engine only (index.ts, RelatedContentOptions, RelatedContentResponse, RelatedContentCacheData) | **DEAD**                                                                     |
| `RelatedContentOptions`       | only in types file (self-referential via RelatedContentProps.options)                                    | **DEAD** — `RelatedContentProps.options` field is unused in server component |
| `RelatedContentResponse`      | **ZERO** external consumers                                                                              | **DEAD**                                                                     |
| `NormalizedContent`           | heuristic engine only (aggregator, cached-aggregator, index.ts, debug route)                             | **DEAD** (after debug route update)                                          |
| `NormalizedContentDisplay`    | only via NormalizedContent.display                                                                       | **DEAD**                                                                     |
| `AggregatedContentCacheEntry` | **ZERO** external consumers                                                                              | **DEAD**                                                                     |
| `RelatedContentCacheData`     | **ZERO** external consumers                                                                              | **DEAD**                                                                     |
| `ContentGraphMetadata`        | **ZERO** — queries use `ContentGraphBuildMetadata` from Zod schema                                       | **DEAD**                                                                     |
| `TagGraph`                    | **ZERO** — queries use `TagGraphFromSchema` from Zod schema                                              | **DEAD**                                                                     |
| `BookmarksIndexEntry`         | **ZERO** external consumers                                                                              | **DEAD**                                                                     |
| `DebugParams`                 | debug route only                                                                                         | **DEAD** (after debug route update)                                          |
| `ScoredItem`                  | debug route only                                                                                         | **DEAD** (after debug route update)                                          |
| `DebugResponseArgs`           | debug route only                                                                                         | **DEAD** (after debug route update)                                          |

---

## Phase A: Extract Utility and Update Debug Route

### Task 1: Extract `limitByTypeAndTotal` to standalone module

**Files:**

- Create: `src/lib/utils/limit-by-type.ts`
- Modify: `src/components/features/related-content/related-content.server.tsx:12`
- Modify: `src/app/api/related-content/route.ts:10`

**Step 1: Create the standalone module**

Create `src/lib/utils/limit-by-type.ts` with the `limitByTypeAndTotal` function extracted verbatim from `content-similarity/index.ts:265-292`:

```typescript
/**
 * Limit scored items by per-type cap then global cap, preserving highest scores.
 *
 * @module lib/utils/limit-by-type
 */

import type { RelatedContentType } from "@/types/related-content";

/**
 * Groups items by `type`, sorts each group by `score` desc, slices to `maxPerType`,
 * flattens, sorts globally by `score` desc, slices to `maxTotal`.
 * Optional `tiebreak` provides stable ordering for equal scores.
 */
export function limitByTypeAndTotal<T extends { type: RelatedContentType; score: number }>(
  items: readonly T[],
  maxPerType: number,
  maxTotal: number,
  tiebreak?: (a: T, b: T) => number,
): T[] {
  const safePerType = Math.max(0, maxPerType);
  const safeTotal = Math.max(0, maxTotal);

  const grouped = items.reduce(
    (acc, item) => {
      (acc[item.type] ||= []).push(item);
      return acc;
    },
    {} as Partial<Record<RelatedContentType, T[]>>,
  );

  const cmp = (a: T, b: T) => {
    const d = b.score - a.score;
    return d !== 0 ? d : tiebreak ? tiebreak(a, b) : 0;
  };

  const perTypeLimited = Object.values(grouped)
    .filter((arr): arr is T[] => Array.isArray(arr))
    .flatMap((typeItems) => typeItems.toSorted(cmp).slice(0, safePerType));

  return perTypeLimited.toSorted(cmp).slice(0, safeTotal);
}
```

**Step 2: Update imports in server component**

In `src/components/features/related-content/related-content.server.tsx`, change:

```typescript
// OLD
import { limitByTypeAndTotal } from "@/lib/content-similarity";
// NEW
import { limitByTypeAndTotal } from "@/lib/utils/limit-by-type";
```

**Step 3: Update imports in API route**

In `src/app/api/related-content/route.ts`, change:

```typescript
// OLD
import { limitByTypeAndTotal } from "@/lib/content-similarity";
// NEW
import { limitByTypeAndTotal } from "@/lib/utils/limit-by-type";
```

**Step 4: Update the existing test**

In `__tests__/lib/content-similarity/limit-by-type-total.test.ts`, change:

```typescript
// OLD
import { limitByTypeAndTotal } from "@/lib/content-similarity";
// NEW
import { limitByTypeAndTotal } from "@/lib/utils/limit-by-type";
```

**Step 5: Run tests to verify**

Run: `bun run test __tests__/lib/content-similarity/limit-by-type-total.test.ts`
Expected: PASS — same function, new location.

**Step 6: Run validate**

Run: `bun run validate`
Expected: 0 errors, 0 warnings.

**Step 7: Commit**

```bash
git add src/lib/utils/limit-by-type.ts \
  src/components/features/related-content/related-content.server.tsx \
  src/app/api/related-content/route.ts \
  __tests__/lib/content-similarity/limit-by-type-total.test.ts
git commit -m "refactor: extract limitByTypeAndTotal to standalone utility module"
```

---

### Task 2: Rewrite debug route to use pgvector pipeline

The debug route (`src/app/api/related-content/debug/route.ts:215 lines`) is the **sole remaining consumer** of the heuristic engine's `aggregateAllContent`, `getContentById`, `calculateSimilarity`, and `DEFAULT_WEIGHTS`. Rewrite it to use the pgvector pipeline.

**Files:**

- Modify: `src/app/api/related-content/debug/route.ts`

**Step 1: Rewrite the debug route**

Replace the heuristic engine imports with:

```typescript
import { findSimilarByEntity } from "@/lib/db/queries/cross-domain-similarity";
import { applyBlendedScoring } from "@/lib/content-graph/blended-scoring";
import { hydrateRelatedContent } from "@/lib/db/queries/content-hydration";
```

Remove these imports entirely:

```typescript
// DELETE
import { aggregateAllContent, getContentById } from "@/lib/content-similarity/aggregator";
import { calculateSimilarity, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
```

Remove the `scoreCandidates`, `groupByType`, and `buildDebugResponse` helper functions.

The GET handler should:

1. Parse and validate params (keep `parseDebugParams` as-is)
2. Call `findSimilarByEntity({ sourceDomain, sourceId, limit: 50 })`
3. Call `applyBlendedScoring(candidates, { maxPerDomain: 10, maxTotal: 50 })`
4. Call `hydrateRelatedContent(scored)` for hydrated items
5. Return JSON with: source info, raw candidates (from pgvector), scored candidates, hydrated items, timing

Keep the build-phase guard and error handling. Remove `NormalizedContent`, `DebugParams`, `ScoredItem`, `DebugResponseArgs` type imports (these will be deleted in Phase B).

Update the Zod schema import to only use what's needed. The debug response shape changes to reflect pgvector scores rather than heuristic breakdowns — this is a dev-only endpoint with no production consumers.

**Step 2: Run build to verify**

Run: `bun run build`
Expected: PASS — route compiles with new imports.

**Step 3: Run validate**

Run: `bun run validate`
Expected: 0 errors, 0 warnings.

**Step 4: Commit**

```bash
git add src/app/api/related-content/debug/route.ts
git commit -m "refactor: rewrite debug route to use pgvector pipeline"
```

---

## Phase B: Delete Heuristic Engine

### Task 3: Delete all heuristic engine modules

After Task 2, **zero files** import from `content-similarity/`. Verify and delete.

**Files:**

- Delete: `src/lib/content-similarity/aggregator.ts` (526 lines)
- Delete: `src/lib/content-similarity/cached-aggregator.ts` (43 lines)
- Delete: `src/lib/content-similarity/tag-ontology.ts` (487 lines)
- Delete: `src/lib/content-similarity/keyword-extractor.ts` (524 lines)
- Delete: `src/lib/content-similarity/index.ts` (292 lines)
- Delete: `__tests__/lib/content-similarity/keyword-extractor.test.ts`
- Delete directory: `src/lib/content-similarity/` (should be empty after above)
- Delete directory: `__tests__/lib/content-similarity/` (limit-by-type test was moved in Task 1)

**Step 1: Verify zero remaining imports**

Run: `grep -r 'from "@/lib/content-similarity' src/ __tests__/ --include='*.ts' --include='*.tsx'`
Expected: ZERO results (Task 1 moved limitByTypeAndTotal, Task 2 rewrote debug route).

**Step 2: Delete files**

```bash
rm src/lib/content-similarity/aggregator.ts
rm src/lib/content-similarity/cached-aggregator.ts
rm src/lib/content-similarity/tag-ontology.ts
rm src/lib/content-similarity/keyword-extractor.ts
rm src/lib/content-similarity/index.ts
rm __tests__/lib/content-similarity/keyword-extractor.test.ts
rmdir src/lib/content-similarity/
```

Note: Keep `__tests__/lib/content-similarity/limit-by-type-total.test.ts` — it was updated in Task 1 to import from the new location. Move it if desired:

```bash
mkdir -p __tests__/lib/utils
mv __tests__/lib/content-similarity/limit-by-type-total.test.ts __tests__/lib/utils/limit-by-type-total.test.ts
rmdir __tests__/lib/content-similarity/
```

**Step 3: Run build**

Run: `bun run build`
Expected: PASS — no remaining references.

**Step 4: Run all tests**

Run: `bun run test`
Expected: limit-by-type-total test passes from new location; keyword-extractor test deleted.

**Step 5: Run validate**

Run: `bun run validate`
Expected: 0 errors, 0 warnings.

**Step 6: Commit**

```bash
git add -A src/lib/content-similarity/ __tests__/lib/content-similarity/ __tests__/lib/utils/
git commit -m "feat: delete heuristic similarity engine (1,872 lines removed)

Modules removed: aggregator.ts, cached-aggregator.ts, tag-ontology.ts,
keyword-extractor.ts, index.ts. All similarity is now pgvector-based."
```

---

## Phase C: Prune Dead Types (fix [LC1a] violation)

### Task 4: Remove dead types from `related-content.ts`

`src/types/related-content.ts` is 428 lines — 78 over the 350-line ceiling. After Phase B, many types have zero consumers.

**Files:**

- Modify: `src/types/related-content.ts` (428 → ~220 lines)
- Modify: `src/types/schemas/related-content.ts` (if it references deleted types)

**Step 1: Delete dead interfaces**

Remove these interfaces/types (verified zero external consumers after Phase B):

| Interface                     | Lines   | Reason Dead                                                     |
| ----------------------------- | ------- | --------------------------------------------------------------- |
| `SimilarityWeights`           | 106-115 | Only used by heuristic engine + dead types below                |
| `RelatedContentOptions`       | 120-137 | Only referenced by `RelatedContentProps.options` (unused field) |
| `RelatedContentResponse`      | 142-168 | Zero consumers                                                  |
| `NormalizedContent`           | 173-192 | Only used by heuristic engine                                   |
| `NormalizedContentDisplay`    | 194-220 | Only via NormalizedContent.display                              |
| `AggregatedContentCacheEntry` | 225-230 | Zero consumers                                                  |
| `RelatedContentCacheData`     | 235-242 | Zero consumers                                                  |
| `ContentGraphMetadata`        | 298-315 | Superseded by `ContentGraphBuildMetadata` from Zod schema       |
| `TagGraph`                    | 320-346 | Superseded by `TagGraphFromSchema` from Zod schema              |
| `BookmarksIndexEntry`         | 367-378 | Zero consumers                                                  |
| `DebugParams`                 | 397-402 | Debug route rewritten (Task 2)                                  |
| `ScoredItem`                  | 407-416 | Debug route rewritten (Task 2)                                  |
| `DebugResponseArgs`           | 421-428 | Debug route rewritten (Task 2)                                  |

Also remove the `options` field from `RelatedContentProps` (line 257) and its `SimilarityWeights` dependency — the server component does not use this field.

**Step 2: Remove the `weights` field from `RelatedContentProps`**

```typescript
// BEFORE (line 247-260)
export interface RelatedContentProps {
  sourceType: RelatedContentType;
  sourceId: string;
  sourceSlug?: string;
  sectionTitle?: string;
  options?: RelatedContentOptions; // DELETE this line
  className?: string;
}

// AFTER
export interface RelatedContentProps {
  sourceType: RelatedContentType;
  sourceId: string;
  sourceSlug?: string;
  sectionTitle?: string;
  className?: string;
}
```

**Step 3: Verify no remaining references to deleted types**

Run: `grep -rE 'SimilarityWeights|RelatedContentOptions|RelatedContentResponse|NormalizedContent|NormalizedContentDisplay|AggregatedContentCacheEntry|RelatedContentCacheData|ContentGraphMetadata[^B]|TagGraph[^F]|BookmarksIndexEntry|DebugParams|ScoredItem|DebugResponseArgs' src/ __tests__/ --include='*.ts' --include='*.tsx'`

Expected: ZERO results (or only within schemas that define their own Zod-inferred versions).

**Step 4: Verify line count**

Run: `wc -l src/types/related-content.ts`
Expected: ≤ 350 lines (target ~220).

**Step 5: Run validate**

Run: `bun run validate`
Expected: 0 errors, 0 warnings.

**Step 6: Run build**

Run: `bun run build`
Expected: PASS.

**Step 7: Commit**

```bash
git add src/types/related-content.ts
git commit -m "chore: remove 13 dead interfaces from related-content types (428→~220 lines)

Types removed: SimilarityWeights, RelatedContentOptions, RelatedContentResponse,
NormalizedContent, NormalizedContentDisplay, AggregatedContentCacheEntry,
RelatedContentCacheData, ContentGraphMetadata, TagGraph, BookmarksIndexEntry,
DebugParams, ScoredItem, DebugResponseArgs. All superseded by pgvector types."
```

---

## Phase D: Documentation and Final Verification

### Task 5: Update architecture documentation

**Files:**

- Modify: `docs/architecture/README.md`
- Modify: `docs/file-map.md`
- Modify: `docs/features/search.md` (if it references heuristic engine)

**Step 1: Update `docs/file-map.md`**

Remove entries for deleted files:

- `src/lib/content-similarity/aggregator.ts`
- `src/lib/content-similarity/cached-aggregator.ts`
- `src/lib/content-similarity/tag-ontology.ts`
- `src/lib/content-similarity/keyword-extractor.ts`
- `src/lib/content-similarity/index.ts`

Add entries for new files:

- `src/lib/utils/limit-by-type.ts` — pure utility for capping results by type and total
- `src/lib/db/queries/content-hydration.ts` — batch domain hydration for pgvector results

**Step 2: Update `docs/architecture/README.md`**

Remove any references to the heuristic similarity engine. Update the related content section to describe the pgvector pipeline:

- `findSimilarByEntity` (HNSW cosine ANN) → `applyBlendedScoring` (cosine + recency + quality) → `hydrateRelatedContent` (batch domain fetch)

**Step 3: Check for stale references**

Run: `grep -r 'content-similarity' docs/ --include='*.md'`
Run: `grep -r 'heuristic' docs/ --include='*.md'`
Run: `grep -r 'aggregateAllContent\|calculateSimilarity\|findMostSimilar' docs/ --include='*.md'`

Fix any stale references found.

**Step 4: Commit**

```bash
git add docs/
git commit -m "docs: update architecture docs for pgvector-only related content pipeline"
```

---

### Task 6: Final verification sweep

**Files:** None (verification only)

**Step 1: Full build**

Run: `bun run build`
Expected: PASS with PPR routes rendering correctly.

**Step 2: Full validation**

Run: `bun run validate`
Expected: 0 errors, 0 warnings.

**Step 3: Full test suite**

Run: `bun run test`
Expected: All non-pre-existing failures pass.

**Step 4: File size check**

Run: `bun run check:file-size`
Expected: No new violations. `src/types/related-content.ts` now under 350 lines.

**Step 5: Dead code scan**

Run: `grep -r 'from "@/lib/content-similarity' src/ __tests__/ --include='*.ts' --include='*.tsx'`
Expected: ZERO results.

Run: `grep -r 'NormalizedContent\|SimilarityWeights\|AggregatedContentCacheEntry' src/ __tests__/ --include='*.ts' --include='*.tsx'`
Expected: ZERO results (unless in Zod schemas that define their own versions).

**Step 6: Report results**

No commit — this is verification only. Report pass/fail for each check.

---

## Summary

| Phase     | Tasks       | Files Deleted      | Lines Removed    | Key Outcome                                      |
| --------- | ----------- | ------------------ | ---------------- | ------------------------------------------------ |
| A         | 1-2         | 0                  | 0                | Extract utility; rewrite debug route to pgvector |
| B         | 3           | 5 modules + 1 test | ~1,872           | Delete entire heuristic engine                   |
| C         | 4           | 0 (type pruning)   | ~208             | `related-content.ts` under 350 lines             |
| D         | 5-6         | 0                  | 0                | Docs updated; full verification green            |
| **Total** | **6 tasks** | **6 files**        | **~2,080 lines** | **pgvector-only architecture, [LC1a] compliant** |
