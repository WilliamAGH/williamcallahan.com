# Search Architecture

**Functionality:** `search`

## Overview

The search functionality provides site-wide and section-specific search capabilities with PostgreSQL hybrid retrieval (full-text + word-level trigram + pgvector), BM25 for the two static domains, caching, and rate limiting. It's primarily accessed through the terminal interface and enables users to find content across blog posts, bookmarks, investments, experience, education, projects, books, thoughts, tags, and AI analysis.

> **Note on Hybrid Retrieval:** Blog posts, bookmarks, books, investments, projects, and thoughts run in PostgreSQL: keyword candidates (`ts_rank_cd` + `word_similarity`) and semantic candidates (pgvector cosine) are ranked separately and merged with Reciprocal Rank Fusion (`1 / (RRF_K + rank)` per list, owner: `lib/db/queries/hybrid-search-config.ts`). Experience, education, tags, and AI analysis rank in TypeScript and are mapped onto the same scale by `scoreByRank()`, which multiplies the reciprocal rank by `RRF_RANKER_COUNT` because those domains run one ranker where a hybrid domain runs two. Without that factor a hybrid row present in both lists at rank 50 (`2/110`) outranks an exact single-ranker match at rank 1 (`1/61`), so the site-wide sort buries it. The keyword-only fallback scales the same way: with no query embedding no semantic ranker runs, so its rank fills both slots.

> **Query embedding:** the query is embedded once per request in the API route (`buildQueryEmbedding`) and passed to every searcher as `QueryEmbeddingContext.precomputed`. If that single call fails, every domain runs keyword-only; searchers never embed the query themselves when a context is present.

## Forbidden Patterns

### Module-Scope Build Phase Checks

**Never** check `NEXT_PHASE` using direct property access—Turbopack/webpack inlines `process.env.NEXT_PHASE` at build time, even inside functions:

```typescript
//  FORBIDDEN - direct property access gets inlined by bundler
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

//  STILL FORBIDDEN - function doesn't help, bundler still inlines the value
const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

//  REQUIRED - bracket notation with variable key prevents static analysis
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;
```

### Route Handlers Require `connection()`

Under Next.js 16 Cache Components, call `connection()` before request-time search work:

```typescript
import { connection } from "next/server";

export async function GET() {
  await connection();
}
```

**Symptom**: `x-nextjs-cache: HIT` with `buildPhase: true` at runtime.

### Caching Empty Results

**Never** cache empty search results when the underlying index is empty (indicates data unavailability, not "no matches").

## Architecture Decisions

1. **Server/Client Boundary**: API-based approach; terminal never imports server modules.

2. **Type Consolidation**: Single `SearchResult` type in `types/schemas/search.ts`; bookmark result `url` values are internal detail paths from `buildBookmarkPath(slug)`, never external bookmark URLs.

3. **Generic Search**: `searchContent<T>` function used by all search implementations.

4. **Caching**: Next.js Cache Components with search tags/lifetimes (~15-minute profiles for server search reads); lazy loading in terminal.

5. **Search Quality**: Reciprocal Rank Fusion merges keyword and semantic candidate lists inside PostgreSQL; MiniSearch (all terms required, prefix + fuzzy) remains the BM25 stage for experience and education. Tag counts come from one PostgreSQL aggregate (`lib/db/queries/tag-counts.ts`) instead of loading every bookmark, post, and book per query.

6. **Index Parity**: S3-loaded indexes hydrate with the same MiniSearch options (boost, fuzzy, idField, extractField) used during build to keep relevance scoring consistent with fresh indexes.

7. **Security**: Query validation (Unicode-aware, 100-char limit, whitespace and edge-punctuation normalization) and shared rate limiting via `applySearchGuards()` across search routes. Punctuation inside the query is kept: PostgreSQL indexes tokens such as `next.js` whole, and no consumer compiles the query into a regular expression. A 429 is shown to the terminal user as a rate-limit message.

## Key Files & Responsibilities

### Core Search Logic

- **`lib/search/searchers/static-searchers.ts`**: Static-domain searchers
  - `searchInvestments()`, `searchProjects()`, `searchExperience()`, `searchEducation()`
- **`lib/search/searchers/dynamic-searchers.ts`**: Dynamic-domain searchers
  - `searchBookmarks()`, `searchBooks()`
- **`lib/search/searchers/thoughts-search.ts`**: PostgreSQL-backed hybrid thoughts search
- **`lib/search/search-content.ts`**: MiniSearch scoring plus `scoreByRank()` (shared reciprocal-rank scale)
- **`lib/search/search-factory.ts`**: Shared cached-search factory used by searchers

- **`lib/blog/server-search.ts`**: Blog-specific search
  - `searchBlogPostsServerSide()`: Searches blog posts with caching

- **`lib/validators/search.ts`**: Query validation
  - `validateSearchQuery()`: Validates and normalizes input (length cap, whitespace, edge punctuation, lowercase)
  - `sanitizeSearchQuery()`: Simple sanitization helper

### API Endpoints

- **`app/api/search/[scope]/route.ts`**: Consolidated search endpoint
  - Handles all search scopes dynamically
  - Validates queries before processing
  - Returns consistent response format
- **`app/api/related-content/debug/route.ts`**: Related content debug endpoint
  - Validates query params with `types/schemas/related-content.ts`
- **Runtime behavior**: Search APIs use `connection()` for request-time execution, resolve request metadata from `request.headers`, and return explicit no-store response headers.
- **`app/api/search/all/route.ts`**: Site-wide search
  - Aggregates results from all sections
  - Adds section prefixes to results
  - Uses query validation
- **`app/api/search/blog/route.ts`**: Legacy blog-specific search
  - Maintained for backward compatibility
  - Routes through server-side search and shares `applySearchGuards()` protections
- **`app/api/search/bookmarks/route.ts`**: Bookmarks-only search
  - Returns only compact ranked `SearchResult` projections; full bookmark records stay server-side
  - Shares `applySearchGuards()` protections

### Caching Layer

- **`lib/search/search-factory.ts`** and **`lib/search/cache-invalidation.ts`**
  - Search functions use `\"use cache\"`, `cacheLife`, and `cacheTag`
  - Search-tag invalidation can be triggered with `revalidateTag(...)`
  - API routes use `connection()` and explicit no-store response headers when fresh responses are required

### Integration Points

- **`components/ui/terminal/commands.client.ts`**: Terminal integration
  - Uses consolidated API endpoint; never imports server modules
  - Non-2xx responses and network failures surface as terminal error lines; aborts propagate so a superseded command is discarded

### Type Definitions

- **`types/schemas/search.ts`**: Single source of truth for schema-backed search result fields
  ```typescript
  export const searchResultSchema = z.object({ ... });
  export type SearchResult = z.infer<typeof searchResultSchema>;
  ```

## Data Flow

See [search.mmd](./search.mmd) for detailed architecture diagrams including:

- Overall architecture flow with all components
- Component interaction sequence diagram

### Simplified Flow

```
User Input -> Terminal -> API Request -> Validation -> Embed query once
                                                            |
                                          +-----------------+-----------------+
                                          |                                   |
                              PostgreSQL hybrid domains            TypeScript domains
                        (blog, bookmarks, books, investments,   (experience, education,
                         projects, thoughts)                     tags, AI analysis)
                        keyword rank + semantic rank -> RRF      rank -> scoreByRank()
                                          |                                   |
                                          +-----------------+-----------------+
                                                            |
                                              sort by score (one scale) -> Response
```

## Search Algorithm

### Generic Search Function

```typescript
function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null,
): T[];
```

### Features

1. **Query Normalization**: Whitespace collapse, edge-punctuation trim, lowercase; inner punctuation kept
2. **MiniSearch Integration** (experience, education):
   - Fuzzy matching (20% edit distance)
   - Prefix matching for autocomplete
   - Multi-word AND search (`combineWith: "AND"`)
3. **Fallback Strategy**: Substring search if MiniSearch fails
4. **Exact Match Priority**: Optional exact field matching
5. **Rank scale**: PostgreSQL domains sum one reciprocal rank per ranker (`1 / (RRF_K + rank)` each, ceiling `2/61`); single-ranker domains and the keyword-only fallback return `RRF_RANKER_COUNT / (RRF_K + rank)` so both shapes share that ceiling. A hybrid row surfaced by only one of two live rankers stays at `1 / (RRF_K + rank)` — the other ranker saw it and passed.

## Performance Optimizations

### Caching Strategy

- **Duration**: 15 minutes for successful searches
- **Failure Handling**: 1 minute cache for failed attempts
- **Key Format**: `search:{dataType}:{normalizedQuery}`
- **Tagged Invalidation**: Search cache profiles are invalidated by domain tag/path updates

### Request shape

1. One query embedding per API request, shared by every domain
2. Tag counts: one PostgreSQL `GROUP BY` (about 40 ms), no index or catalog loads
3. API-based: no server modules in the client bundle

### Index Management

- **Static Data**: Singleton MiniSearch indexes
- **Dynamic Data**: Real-time API fetching
- **Lazy Initialization**: Indexes created on first use

## Security Features

### Query Validation

- **Length Limit**: 100 characters maximum
- **Empty Queries**: Rejected with error message
- **Edge Punctuation**: Stripped at both ends; inner punctuation (`next.js`, `node.js`) kept for token matching

### API Security

- **Input Validation**: All endpoints validate queries
- **Error Handling**: Safe error messages
- **Rate Limiting**: Ready for implementation

## Testing

### Test Coverage

- **Unit Tests**: `__tests__/lib/search/search.test.ts`
  - Query validation and sanitization
  - Cache behavior verification
  - Search algorithm correctness
  - 34 tests, all passing

### Test Categories

1. **Validation Tests**: Query sanitization and limits
2. **Cache Tests**: Hit/miss behavior, storage
3. **Search Tests**: Exact, partial, multi-word
4. **Integration Tests**: API endpoint behavior

## Future Enhancements

### Planned Improvements

1. **Build-time Indexing**: Pre-generate search indexes
2. **Highlighting**: Return match positions
3. **Ranking**: Implement relevance scoring
4. **Synonyms**: Support alternative terms
5. **Rate Limiting**: Implement API throttling

### Architecture Evolution

```
Current:
Runtime indexing -> Memory usage -> API-based search

Future:
Build-time index -> Static files -> Edge caching -> Instant search
```

## Migration Notes

### Breaking Changes

- Terminal commands now use `/api/search/[scope]` endpoint
- `SearchResult` type moved to `types/schemas/search.ts`
- Query validation may reject previously valid queries

### Backward Compatibility

- Legacy `/api/search/blog` endpoint maintained
- Fallback substring search for MiniSearch failures
- Cache-aside pattern allows gradual rollout

## Usage Examples

### Terminal Search

```bash
# Section-specific search
blog react hooks
bookmarks typescript

# Site-wide search
react typescript nextjs

# Fuzzy search (typo tolerance)
raect  # finds "react"
typscript  # finds "typescript"
```

### API Usage

```typescript
// Scoped search
GET /api/search/blog?q=react+hooks

// Site-wide search
GET /api/search/all?q=nextjs

// Response format
{
  "results": [...],
  "meta": {
    "query": "react hooks",
    "scope": "blog",
    "count": 5,
    "timestamp": "<ISO-8601 timestamp>"
  }
}
```

## Monitoring & Debugging

### Cache Monitoring

```typescript
// Invalidate tagged search cache entries when refresh flows complete
import { revalidateTag } from "next/cache";
revalidateTag("search");
```

### Debug Logging

- Development mode includes search timing logs
- Cache hit/miss logged for debugging
- Query sanitization results visible

This architecture provides sub-50ms search response times with improved search quality through fuzzy matching while maintaining security and performance.
