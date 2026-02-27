# Embedding-Based Similarity & Search Consolidation

> Design doc for upgrading all similarity algorithms and search to leverage Qwen3-Embedding-4B
> 2560-d halfvec embeddings via a unified embeddings table, migrating all content domains into
> PostgreSQL with standardized schema patterns.

**Date:** 2026-02-26
**Status:** Approved
**Scope:** All content domains (bookmarks, thoughts, blog posts, books, investments, projects)

---

## Problem Statement

The site has three problems:

**1. Fragmented search backends** at different levels of embedding adoption:

- PostgreSQL hybrid search (bookmarks, thoughts) — FTS + trigram + pgvector
- MiniSearch + live embedding rerank (books, investments, projects) — BM25 + query-time rerank
- Heuristic content similarity (related content) — Jaccard tag overlap + token intersection. Uses **zero** embeddings.

**2. Scattered embedding storage** — 4 tables each have their own `halfvec(2560)` column and HNSW index for the same model (Qwen3-4B). This violates the universal vector DB best practice: **same model + same dimensions = one index**. Cross-domain similarity requires an ugly N-way UNION ALL.

**3. Highest-visibility feature uses lowest-quality algorithm** — related content suggestions use Jaccard/token heuristics while golden embedding data sits unused.

## Goals

1. **Unified `embeddings` table** — one HNSW index for all domains; same model + same dimensions = one table
2. **All content in PostgreSQL** — per-domain tables for domain-specific columns + FTS/trigram; embeddings in unified table
3. **One hybrid search path** (3-CTE: FTS + trigram + pgvector) for all domains — eliminates MiniSearch
4. **Embedding-based related content** — single-query cross-domain cosine similarity; eliminates heuristic engine
5. **Eliminate:** per-domain embedding columns, MiniSearch, `rerankScoredResultsWithEmbeddings()`, heuristic `content-similarity/` engine, `tag-ontology.ts`

## Non-Goals

- Changing the embedding model or dimensions (Qwen3-4B at 2560-d is the standard)
- Real-time embedding generation at page-render time for related content
- User-facing search UI changes (backend-only upgrade)
- Education/experience domain migration (low-volume static display data; deferred)

---

## Architecture

### Layer 1: Unified Embeddings Table

**The core structural fix.** All embeddings live in one table with one HNSW index:

```
┌───────────────────────────────────────────────────────────────┐
│  embeddings                                           │
├───────────────────────────────────────────────────────────────┤
│  domain           text NOT NULL  ('bookmark','thought',...)   │
│  entity_id        text NOT NULL                               │
│  title            text NOT NULL  (for display in ANN results) │
│  embedding_text   text           (input that was embedded)    │
│  content_date     text           (for recency scoring)        │
│  qwen_4b_fp16_embedding  halfvec(2560)  ← ONE HNSW index     │
│  updated_at       bigint                                      │
│  PRIMARY KEY (domain, entity_id)                              │
└───────────────────────────────────────────────────────────────┘
```

**Why one table:**

- Pinecone, Qdrant, Weaviate, pgvector all recommend: same model + same dimensions = one index
- One HNSW graph with more vectors is more accurate than 8 small graphs (better ANN approximation)
- Cross-domain similarity becomes a single query with one index scan — no UNION ALL
- One backfill pipeline, one target table, one index rebuild
- Per-domain filtering via `WHERE domain = ?` with HNSW post-filtering (trivial at ~500 items)

**Embedding invariants (enforced by constants in schema file):**

- Model: `Qwen/Qwen3-Embedding-4B`
- Dimensions: 2560
- Precision: FP16 (halfvec)
- Index: HNSW with `halfvec_cosine_ops`

**Valid domain values:** `bookmark`, `thought`, `blog`, `book`, `investment`, `project`, `ai_analysis`, `opengraph`

### Layer 2: Per-Domain Tables (Text Search Only)

Per-domain tables store domain-specific columns and text search infrastructure. **No embedding columns** — embeddings are in `embeddings`.

```
┌──────────────────────────────────────────────┐
│  <domain>_table                              │
├──────────────────────────────────────────────┤
│  ...domain-specific columns...               │
│  search_vector   tsvector GENERATED ALWAYS   │  ← GIN index (domain-specific weights)
│  title           text                        │  ← gin_trgm_ops index
│  (NO embedding column)                       │
└──────────────────────────────────────────────┘
```

FTS weights are genuinely domain-specific — bookmarks weight title/description/summary/note while blog posts weight title/excerpt/tags/rawContent. This belongs in per-domain tables.

**Existing tables (modify — remove embedding column):**

| Table                | Change                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| `bookmarks`          | Remove `qwen_4b_fp16_embedding` column + HNSW index; keep tsvector + trigram |
| `thoughts`           | Remove `qwen_4b_fp16_embedding` column + HNSW index; keep tsvector + trigram |
| `ai_analysis_latest` | Remove `qwen_4b_fp16_embedding` column + HNSW index                          |
| `opengraph_metadata` | Remove `qwen_4b_fp16_embedding` column + HNSW index                          |

**New tables (create without embedding column):**

| Domain      | Table Name                | Source                                             |
| ----------- | ------------------------- | -------------------------------------------------- |
| Blog posts  | `blog_posts`              | MDX files → PostgreSQL (raw content + frontmatter) |
| Books       | `books` (individual rows) | JSONB blob in `books_snapshots` → individual rows  |
| Investments | `investments`             | Static `data/investments.ts` → PostgreSQL          |
| Projects    | `projects`                | Static `data/projects.ts` → PostgreSQL             |

### Layer 3: Per-Domain Embedding Input Construction

Each domain defines a `build<Domain>EmbeddingInput()` function. All write to `embeddings`.

| Domain      | Embedding Input Fields (priority order)                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| Bookmarks   | title, description, summary, note, domain, tags, content metadata, URL, scrapedContent (last) |
| Thoughts    | title, content, category, tags                                                                |
| Blog        | title, excerpt, tags, author, rawContent (last)                                               |
| Books       | title, subtitle, authors, genres, publisher, description, aiSummary, thoughts (last)          |
| Investments | name, description, category, stage, status, accelerator                                       |
| Projects    | name, shortSummary, description, tags, techStack                                              |

### Layer 4: Unified Hybrid Search

A **generic hybrid search builder** using the 3-CTE pattern. The FTS/trigram CTEs query the domain table; the semantic CTE queries `embeddings`.

```
Query
  → embedTextsWithEndpointCompatibleModel(query)
  → ┌─ CTE: keyword_results (domain_table.search_vector @@ tsquery + title % query)
    ├─ CTE: semantic_results (embeddings.embedding <=> query_vec WHERE domain = ?)
    └─ CTE: combined (FULL OUTER JOIN on entity_id, weighted: FTS*2.0 + trgm*0.5 + vector*10.0)
  → JOIN domain_table → hydrate full rows → ranked results
```

**Cross-domain search** — single query, single index scan:

```sql
SELECT domain, entity_id, title,
  1.0 - (qwen_4b_fp16_embedding <=> $1) AS similarity
FROM embeddings
WHERE qwen_4b_fp16_embedding IS NOT NULL
ORDER BY qwen_4b_fp16_embedding <=> $1
LIMIT 20;
```

No UNION ALL. One HNSW traversal. Results naturally span all domains.

### Layer 5: Embedding-Based Related Content (Pre-Computed)

Replaces the heuristic `findMostSimilar()` in `build.ts` with a single pgvector query per item.

**Computation (offline, in `buildContentGraph`):**

For each content item with a stored embedding:

1. Read the item's embedding from `embeddings`
2. Query `embeddings` for nearest neighbors (excluding self) — **one query, one index scan**:

```sql
SELECT domain, entity_id, title, content_date,
  1.0 - (qwen_4b_fp16_embedding <=> $source_embedding) AS similarity
FROM embeddings
WHERE NOT (domain = $src_domain AND entity_id = $src_id)
  AND qwen_4b_fp16_embedding IS NOT NULL
ORDER BY qwen_4b_fp16_embedding <=> $source_embedding
LIMIT 30;  -- fetch extra for diversity re-ranking
```

3. Apply blended scoring:

| Signal            | Weight | Source                                                                    |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| Cosine similarity | 0.70   | `1.0 - (embedding <=> source_embedding)` from pgvector                    |
| Recency boost     | 0.10   | Age-based decay: <=7d=0.95, <=30d=0.85, <=90d=0.70, <=365d=0.30, >1y=0.10 |
| Domain diversity  | 0.10   | Post-processing re-rank to ensure cross-domain variety                    |
| Content quality   | 0.10   | Proxies: has-scraped-content, word count, is-favorite, has-description    |

4. Store top-20 results per item in `content_graph_artifacts` (`"related-content"` artifact type)
5. Existing JSONB shape `{ "<type>:<id>": [{ type, id, score, title }] }` is preserved

**Performance:** Each item's related content = one ANN query (~2-5ms). For ~500 items, full rebuild ≈ 1-2.5 seconds. Compare: current heuristic O(n²) pairwise loop with token overlap takes 10-30 seconds.

**Trigger schedule:**

- On bookmark/content change (via `DataFetchManager` Step 5, existing trigger)
- Nightly full refresh (existing 2-hour bookmarks cron already triggers this)
- After any domain migration backfill completes

### What Gets Eliminated

| Current System                              | File(s)                                   | Replaced By                                           |
| ------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Per-domain embedding columns + HNSW indexes | 4 schema files                            | Unified `embeddings` table                            |
| MiniSearch in-memory indexes                | `search-content.ts`, `search-factory.ts`  | PostgreSQL hybrid search on all domains               |
| `rerankScoredResultsWithEmbeddings()`       | `search-content.ts:172`                   | Native pgvector in 3-CTE query                        |
| Heuristic `calculateSimilarity()`           | `content-similarity/*`                    | Pre-computed pgvector cosine + blended scoring        |
| Tag ontology (manual semantic groups)       | `content-similarity/tag-ontology.ts`      | Embeddings capture semantic relationships natively    |
| `aggregateAllContent()` normalizer          | `content-similarity/aggregator.ts`        | Direct PostgreSQL queries on standardized tables      |
| `NormalizedContent` intermediary type       | `types/related-content.ts`                | Domain-specific types with shared embedding interface |
| Books JSONB blob storage                    | `books_snapshots`/`books_latest`          | Individual `books` rows                               |
| Static data imports for search              | `data/investments.ts`, `data/projects.ts` | PostgreSQL queries (static files remain as seed data) |

---

## Domain Migration Details

### Blog Posts → `blog_posts` Table

**Source:** MDX files in `data/blog/posts/*.mdx`
**Strategy:** Parse frontmatter + raw content at seed/sync time, store in PostgreSQL. MDX files remain the authoring source; a sync script populates the DB.

**Schema columns (no embedding — that goes in embeddings):**

- `id` (text PK, `"mdx-{slug}"`)
- `slug` (text, unique, not null)
- `title` (text, not null)
- `excerpt` (text)
- `raw_content` (text) — raw MDX body for search
- `author_id` (text)
- `tags` (jsonb, `string[]`)
- `published_at` (text — ISO date)
- `updated_at` (text)
- `reading_time` (integer)
- `cover_image` (text) — S3 CDN URL
- `draft` (boolean, default false)
- `search_vector` (tsvector, generated: A=title, B=excerpt, C=tags, D=raw_content)

**MDX rendering:** Continues to use `next-mdx-remote` at render time from the MDX file. The DB stores raw content for search/embedding only.

### Books → `books` Table (Individual Rows)

**Source:** AudioBookShelf API → `books_snapshots` JSONB blob
**Strategy:** Normalize from single-blob to individual rows.

**Schema columns:**

- `id` (text PK, ABS item UUID)
- `slug` (text, unique) — from book-enrichments
- `title` (text, not null)
- `subtitle` (text)
- `authors` (jsonb, `string[]`)
- `publisher` (text)
- `published_year` (text)
- `genres` (jsonb, `string[]`)
- `description` (text) — HTML-stripped
- `formats` (jsonb, `("ebook"|"audio"|"print")[]`)
- `audio_narrators` (jsonb, `string[]`)
- `audio_duration_seconds` (integer)
- `cover_url` (text)
- `ai_summary` (text) — from enrichments
- `thoughts_text` (text) — personal annotations (renamed to avoid SQL keyword)
- `external_links` (jsonb) — findMyBook, amazon, audible, bookshop URLs
- `search_vector` (tsvector, generated: A=title, B=subtitle+authors, C=genres+description)

**Backward compatibility:** `books_latest`/`books_snapshots` tables retained during migration.

### Investments → `investments` Table

**Source:** Static `data/investments.ts`
**Strategy:** Seed from static file. Static file remains as authoring source.

**Schema columns:**

- `id` (text PK), `name` (text, not null), `slug` (text, unique), `description`, `type`, `stage`, `category`, `status`, `operating_status`, `invested_year`, `location`, `website`, `logo`, `metrics` (jsonb), `details` (jsonb)
- `search_vector` (tsvector, generated: A=name, B=description, C=category+stage)

### Projects → `projects` Table

**Source:** Static `data/projects.ts`
**Strategy:** Same as investments.

**Schema columns:**

- `id` (text PK), `name` (text, not null), `slug` (text, unique), `description`, `short_summary`, `url`, `github_url`, `image_key`, `tags` (jsonb), `tech_stack` (jsonb), `note`, `cv_featured` (boolean)
- `search_vector` (tsvector, generated: A=name, B=short_summary+description, C=tags)

---

## Implementation Phases

### Phase 1: Unified Embeddings Table & Migration

1. **Create `embeddings` table** with HNSW index — the foundation for everything
2. **Migrate existing embeddings** from bookmarks, thoughts, ai_analysis_latest, opengraph_metadata into embeddings
3. **Update hybrid-search.ts** — semantic CTE queries embeddings instead of domain table
4. **Update bookmark-embeddings.ts** — backfill writes to embeddings
5. **Remove embedding columns** from existing domain tables (after verifying all queries work)

### Phase 2: Domain Migrations

Each domain migration is independent. Order by impact:

1. **Investments** — simplest, static data, establishes pattern
2. **Projects** — same static data pattern
3. **Books** — normalize JSONB blob to individual rows
4. **Blog posts** — MDX sync pipeline

Each migration includes: Drizzle schema (FTS + trigram, no embedding column), migration SQL, seed/sync script, data access layer, embedding input builder (writes to embeddings), tests.

### Phase 3: Unified Hybrid Search

Replace MiniSearch with PostgreSQL hybrid search for all domains:

1. **Generic hybrid search builder** — FTS/trigram on domain table + semantic on embeddings
2. **Per-domain search functions** — wire each domain through the builder
3. **Cross-domain search** — single query on embeddings for `/api/search/all`
4. **Remove MiniSearch** — delete search indexes, search-factory, rerank layer

### Phase 4: Embedding-Based Related Content

Replace heuristic similarity with pgvector cosine queries:

1. **Single-query similarity function** — query embeddings for nearest neighbors
2. **Blended scoring** — cosine (0.70) + recency (0.10) + diversity (0.10) + quality (0.10)
3. **Update `buildContentGraph`** — replace `findMostSimilar()` with pgvector queries
4. **Remove heuristic engine** — delete content-similarity/, tag-ontology.ts, aggregator.ts
5. **Simplify `RelatedContent` component** — no more `aggregateAllContent()`

### Phase 5: Cleanup & Verification

1. Remove dead code: per-domain embedding constants, MiniSearch imports, NormalizedContent type
2. Update docs: search.md, architecture/README.md, file-map.md
3. Confirm stale docs remain deleted: `docs/architecture/chroma.md`
4. `bun run validate` — zero errors, zero warnings
5. `bun run build` — production build passes
6. Manual quality verification: search and related content

---

## Risk Mitigation

| Risk                                                    | Mitigation                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Embedding server unavailable during content graph build | Fallback: skip items without embeddings; log warnings; don't overwrite existing pre-computed results |
| HNSW post-filtering on `WHERE domain = ?` misses rows   | At ~500 total items, post-filtering is trivially fast; partition by domain later if scale demands it |
| Migration breaks existing pages during transition       | Semantic CTE queries embeddings immediately after data migration; old columns kept until verified    |
| Blog MDX sync creates drift between files and DB        | MDX files remain authoritative; sync script is idempotent and runs on content change                 |
| Books ABS API changes                                   | Existing transform layer handles shape changes; DB schema is independent                             |

---

## Success Criteria

1. All embeddings in one `embeddings` table with one HNSW index
2. All 6 content domains have rows in `embeddings`
3. Site-wide search uses a single hybrid search path (no MiniSearch)
4. Related content uses embedding-based cosine similarity (no heuristic engine)
5. Cross-domain similarity is a single pgvector query (no UNION ALL)
6. `bun run validate` passes clean
7. No regression in search result quality for bookmarks/thoughts
8. Related content quality visibly improved (manual verification)
