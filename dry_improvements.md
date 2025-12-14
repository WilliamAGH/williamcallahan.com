# DRY Improvements Tracking

Last Updated: 2025-12-13T12:00:00Z
Repository: williamcallahan.com

## Section 1: Implementation Status Summary

### ✅ COMPLETED - Major Refactoring (Dec 2025)

The search module has been significantly refactored from a monolithic `search.ts` into a modular structure under `src/lib/search/`. The following DRY improvements have been **fully implemented**:

| Priority | Pattern                        | Implementation                                     | Lines Saved | Status  |
| -------- | ------------------------------ | -------------------------------------------------- | ----------- | ------- |
| 1        | Index Factory Pattern          | `src/lib/search/index-factory.ts`                  | ~100        | ✅ DONE |
| 2        | Cached Search Function Factory | `src/lib/search/search-factory.ts`                 | ~140        | ✅ DONE |
| 3        | Serialized Index Helper        | `src/lib/search/serialization.ts:serializeIndex()` | ~50         | ✅ DONE |
| 4        | Tag Aggregator Utility         | `src/lib/search/tag-aggregator.ts`                 | ~50         | ✅ DONE |
| 5        | Index Configurations           | `src/lib/search/config.ts`                         | ~80         | ✅ DONE |

**Total Lines Saved: ~420 lines**

### New Module Structure

```
src/lib/search/
├── index.ts                 # Public API exports
├── config.ts                # Centralized index configurations
├── constants.ts             # Cache keys, TTLs, S3 paths
├── index-builder.ts         # Build-time index generation for S3
├── index-factory.ts         # Generic createIndex<T>() factory
├── search-factory.ts        # createCachedSearchFunction<T,R>() factory
├── search-content.ts        # Core search algorithm
├── serialization.ts         # Index serialization helpers
├── tag-aggregator.ts        # Generic tag counting
├── cache-invalidation.ts    # Cache management
├── api-guards.ts            # API route utilities
├── loaders/
│   ├── static-content.ts    # Static data index loaders
│   └── dynamic-content.ts   # Dynamic data index loaders (bookmarks, books)
└── searchers/
    ├── static-searchers.ts  # investments, experience, education, projects
    ├── dynamic-searchers.ts # bookmarks, books
    ├── tag-search.ts        # Tag aggregation search
    └── thoughts-search.ts   # Thoughts/ChromaDB search
```

---

## Section 2: Remaining Deduplication Opportunities

| Priority | Issue                           | Files                                                             | Est. Lines Saved | Impact  |
| -------- | ------------------------------- | ----------------------------------------------------------------- | ---------------- | ------- |
| ~~1~~    | ~~Type definition duplication~~ | ~~`types/search.ts` vs `types/schemas/search.ts`~~                | ~~60~~           | ✅ DONE |
| 2        | MiniSearch creation in loaders  | `loaders/dynamic-content.ts:40-50` and `325-340`                  | ~20              | LOW     |
| 3        | Bookmark transformation logic   | `index-builder.ts:151-175` and `loaders/dynamic-content.ts:53-68` | ~25              | MED     |

### Opportunity Details

#### 1. Type Definition Duplication ✅ COMPLETED (Dec 2025)

**Resolution:** `types/schemas/search.ts` is now the **definitive source of truth** using Zod v4 schemas.

**Changes Made:**

- Added `SearchScope`, `SearchResultType`, `SearchResult`, `ScoredResult` to `types/schemas/search.ts`
- Updated `types/search.ts` to re-export all types from schemas (no local definitions)
- Updated `types/lib.ts` to import search types from schemas
- Removed deprecated `searchResultItemSchema` and `SearchResultItem` aliases

**Architecture:**

```
types/schemas/search.ts  <-- Zod schemas (source of truth)
       ↓
types/search.ts          <-- Re-exports + generic interfaces (can't be Zod)
       ↓
types/lib.ts             <-- Re-exports for lib.ts consumers
```

---

#### 2. MiniSearch Creation in Dynamic Loaders (LOW PRIORITY)

**Current State:** `loaders/dynamic-content.ts` creates MiniSearch instances manually instead of using `createIndex()` from `index-factory.ts`.

**Locations:**

- `buildBookmarksIndex()` L40-50
- `buildBooksIndex()` L325-340

**Reason for Duplication:** These functions need to build indexes from raw data that requires transformation before indexing (slug generation, field mapping), which doesn't fit cleanly into `createIndex()`.

**Recommendation:** Could create a `createIndexFromConfig()` variant that accepts pre-transformed documents. LOW priority since the duplication is minimal (~20 lines total).

---

#### 3. Bookmark Transformation Logic (MEDIUM PRIORITY)

**Current State:** Bookmark-to-index transformation appears in two places:

| Location                           | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `index-builder.ts:151-175`         | Build-time S3 index generation    |
| `loaders/dynamic-content.ts:53-68` | Runtime index building (fallback) |

**Difference:** The `index-builder.ts` version throws on missing slugs; the loader version skips them.

**Recommendation:** Extract shared transformation logic:

```typescript
// src/lib/search/transformers/bookmark-transformer.ts
export function transformBookmarkForIndex(
  bookmark: BookmarkIndexInput,
  slugResolver: (id: string) => string | null,
  onMissingSlug: 'throw' | 'skip' | 'fallback' = 'skip',
): BookmarkIndexItem | null { ... }
```

---

## Section 3: Pattern Library Status

### Implemented Patterns ✅

1. **Index Configuration Objects** (`config.ts`)
   - `INVESTMENTS_INDEX_CONFIG`
   - `EXPERIENCE_INDEX_CONFIG`
   - `EDUCATION_INDEX_CONFIG`
   - `PROJECTS_INDEX_CONFIG`
   - `BOOKMARKS_INDEX_CONFIG`
   - `BOOKS_INDEX_CONFIG`
   - `POSTS_INDEX_CONFIG`

2. **Factory Functions**
   - `createIndex<T>()` - Generic index creation with deduplication
   - `createIndexWithoutDedup<T>()` - Index creation for pre-deduplicated data
   - `createCachedSearchFunction<TDoc, TResult>()` - HOF for search functions

3. **Utility Functions**
   - `serializeIndex()` - Standardized SerializedIndex creation
   - `aggregateTags<T>()` - Generic tag counting
   - `aggregateMultipleSources<T>()` - Multi-source tag aggregation

### Patterns to Consider

1. **Index Loader Factory** - Could further reduce boilerplate in loaders
2. **Bookmark Transformer** - Extract shared transformation logic (see #3 above)

---

## Section 4: JSDoc Enhancement Status

### Updated Files ✅

All factory functions and config exports now have comprehensive JSDoc:

| File                               | JSDoc Status |
| ---------------------------------- | ------------ |
| `src/lib/search/index-factory.ts`  | ✅ Complete  |
| `src/lib/search/search-factory.ts` | ✅ Complete  |
| `src/lib/search/config.ts`         | ✅ Complete  |
| `src/lib/search/tag-aggregator.ts` | ✅ Complete  |
| `src/lib/search/serialization.ts`  | ✅ Complete  |

### Files Needing Updates

| File                                        | Current State | Needed JSDoc                       |
| ------------------------------------------- | ------------- | ---------------------------------- |
| `src/lib/search/loaders/dynamic-content.ts` | Partial       | Add `@see` references to config.ts |

---

## Section 5: Metrics & Progress

- **Total Duplicate Lines Identified (original):** ~510
- **Lines Saved via Refactoring:** ~480 (420 from modularization + 60 from type consolidation)
- **Remaining Duplicates:** ~45 (MiniSearch creation + bookmark transformation)
- **Deduplication Rate:** 91%
- **Domains Fully Audited:** 6/6 (search-related)
- **Last Full Scan:** 2025-12-13

---

## Section 6: Domain Audit Status

| Domain           | File Paths                        | Last Checked | Status                         |
| ---------------- | --------------------------------- | ------------ | ------------------------------ |
| Search Core      | `src/lib/search/*.ts`             | 2025-12-13   | ✅ Refactored                  |
| Search Loaders   | `src/lib/search/loaders/*.ts`     | 2025-12-13   | ✅ Reviewed                    |
| Search Searchers | `src/lib/search/searchers/*.ts`   | 2025-12-13   | ✅ Uses factories              |
| Index Builder    | `src/lib/search/index-builder.ts` | 2025-12-13   | ✅ Uses shared config          |
| Search Types     | `src/types/search.ts`             | 2025-12-13   | ⚠️ Duplicates with schemas     |
| Schema Types     | `src/types/schemas/search.ts`     | 2025-12-13   | ⚠️ Candidate for consolidation |

---

## Section 7: Recommended Next Steps

### Immediate (Low Risk)

1. Consolidate `types/schemas/search.ts` into `types/search.ts`
2. Remove unused schema exports

### Future (When Touching These Files)

3. Extract bookmark transformation to shared helper
4. Consider using `createIndex()` in dynamic loaders

---

## Appendix: File Line Counts (Reference)

```
src/lib/search/
├── index.ts                  37 lines
├── config.ts                140 lines
├── constants.ts              35 lines (estimated)
├── index-builder.ts         289 lines
├── index-factory.ts         102 lines
├── search-factory.ts         84 lines
├── search-content.ts         50 lines (estimated)
├── serialization.ts         137 lines
├── tag-aggregator.ts         93 lines
├── cache-invalidation.ts     30 lines (estimated)
├── loaders/
│   ├── static-content.ts    150 lines (estimated)
│   └── dynamic-content.ts   389 lines
└── searchers/
    ├── static-searchers.ts  130 lines
    ├── dynamic-searchers.ts 212 lines
    ├── tag-search.ts         80 lines (estimated)
    └── thoughts-search.ts    60 lines (estimated)

Total: ~1,998 lines (down from ~2,500 in original monolith)
```
