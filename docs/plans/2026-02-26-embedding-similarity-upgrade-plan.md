# Embedding-Based Similarity & Search Consolidation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all embeddings into a unified `embeddings` table, migrate all content domains to PostgreSQL with FTS/trigram schemas, replace MiniSearch with unified hybrid search, and replace heuristic related-content with embedding-based cosine similarity.

**Architecture:** One `embeddings` table with a single HNSW index for all domains. Per-domain PostgreSQL tables with `tsvector` + `gin_trgm_ops` for text search. Unified 3-CTE hybrid search (FTS/trigram on domain table + semantic on embeddings). Pre-computed cross-domain related content via single-query pgvector cosine ANN.

**Tech Stack:** Drizzle ORM 0.45+, pgvector (halfvec, HNSW), PostgreSQL FTS (tsvector, ts_rank_cd), pg_trgm, postgres.js driver, Vitest, Qwen3-Embedding-4B (2560-d FP16)

**Design doc:** `docs/plans/2026-02-26-embedding-similarity-upgrade-design.md`

**Embedding input contract:** `src/lib/db/embedding-input-contracts.ts` + `src/lib/db/embedding-field-specs.ts`
— Canonical per-domain field maps with unambiguous labels. Every `build*EmbeddingInput()` function MUST follow these contracts. Labels are qualified nouns ("Company Name" not "Name", "Website Hostname" not "Domain") to avoid ambiguity in the vector space. Verified against actual type definitions and real data.

---

## Phase 1: Unified Embeddings Table & Existing Data Migration

This phase creates the foundation — the single embeddings table — and migrates existing data into it. All subsequent work depends on this.

### Task 1: Create `embeddings` Table

**Files:**

- Create: `src/lib/db/schema/content-embeddings.ts`
- Modify: `drizzle.config.ts` (add `"embeddings"` to `tablesFilter`)
- Test: `__tests__/lib/db/schema/content-embeddings.test.ts`

**Step 1: Write the Drizzle schema**

Create `src/lib/db/schema/content-embeddings.ts`:

```typescript
import { type SQL, sql } from "drizzle-orm";
import { bigint, customType, halfvec, index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const CONTENT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-4B" as const;
export const CONTENT_EMBEDDING_DIMENSIONS = 2560 as const;

/** Valid domain values for embeddings */
export const CONTENT_EMBEDDING_DOMAINS = [
  "bookmark",
  "thought",
  "blog",
  "book",
  "investment",
  "project",
  "ai_analysis",
  "opengraph",
] as const;
export type ContentEmbeddingDomain = (typeof CONTENT_EMBEDDING_DOMAINS)[number];

export const embeddings = pgTable(
  "embeddings",
  {
    domain: text("domain").$type<ContentEmbeddingDomain>().notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    embeddingText: text("embedding_text"),
    contentDate: text("content_date"),
    qwen4bFp16Embedding: halfvec("qwen_4b_fp16_embedding", {
      dimensions: CONTENT_EMBEDDING_DIMENSIONS,
    }),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.domain, table.entityId] }),
    index("idx_embeddings_hnsw").using("hnsw", table.qwen4bFp16Embedding.op("halfvec_cosine_ops")),
    index("idx_embeddings_domain").on(table.domain),
  ],
);
```

**Step 2: Add to drizzle.config.ts tablesFilter**

Add `"embeddings"` to the `tablesFilter` array.

**Step 3: Generate migration**

Run: `bunx drizzle-kit generate`
Expected: New migration file. Verify it has the composite PK and HNSW index.

**Step 4: Write schema test**

Create `__tests__/lib/db/schema/content-embeddings.test.ts`:

- Test `CONTENT_EMBEDDING_DIMENSIONS === 2560`
- Test `CONTENT_EMBEDDING_DOMAINS` contains all expected domains
- Test the table has expected columns

**Step 5: Run tests**

Run: `bun run test __tests__/lib/db/schema/content-embeddings.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/db/schema/content-embeddings.ts drizzle.config.ts drizzle/ __tests__/lib/db/schema/content-embeddings.test.ts
git commit -m "feat(db): add unified embeddings table with single HNSW index"
```

---

### Task 2: Migrate Existing Embeddings into embeddings

Move embedding data from bookmarks, thoughts, ai_analysis_latest, and opengraph_metadata into the unified table.

**Files:**

- Create: `scripts/migrate-embeddings-to-unified.node.mjs`

**Step 1: Write the migration script**

Create `scripts/migrate-embeddings-to-unified.node.mjs` using raw postgres.js (not Drizzle — matches `scripts/migrate-s3-data-to-pg.node.mjs` pattern):

```javascript
// For each existing domain with embeddings:
// 1. Read rows where qwen_4b_fp16_embedding IS NOT NULL
// 2. INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
//    ON CONFLICT (domain, entity_id) DO UPDATE SET ...

// Bookmarks: domain='bookmark', entity_id=id, title=title, content_date=date_bookmarked
// Thoughts: domain='thought', entity_id=id, title=title, content_date=to_char(created_at)
// AI Analysis: domain='ai_analysis', entity_id=entity_id (composite with domain column in source)
// OpenGraph: domain='opengraph', entity_id=url_hash
```

The script copies the halfvec column directly — no re-embedding needed:

```sql
INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
SELECT 'bookmark', id, title, date_bookmarked, qwen_4b_fp16_embedding, extract(epoch from now())::bigint
FROM bookmarks
WHERE qwen_4b_fp16_embedding IS NOT NULL
ON CONFLICT (domain, entity_id) DO UPDATE
SET qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding,
    title = EXCLUDED.title,
    updated_at = EXCLUDED.updated_at;
```

**Step 2: Add package.json script**

Add: `"embeddings:migrate-to-unified": "node scripts/migrate-embeddings-to-unified.node.mjs"`

**Step 3: Verify row counts after running**

```sql
SELECT domain, count(*) FROM embeddings GROUP BY domain ORDER BY domain;
```

Expected: matching counts from each source table.

**Step 4: Commit**

```bash
git add scripts/migrate-embeddings-to-unified.node.mjs package.json
git commit -m "feat(db): add migration script for existing embeddings to unified table"
```

---

### Task 3: Update Hybrid Search to Query embeddings

Modify the existing hybrid search queries to read embeddings from the unified table instead of per-domain columns.

**Files:**

- Modify: `src/lib/db/queries/hybrid-search.ts`
- Modify: `__tests__/lib/db/queries/` (if hybrid search tests exist)

**Step 1: Update hybridSearchWithEmbedding (bookmarks)**

In `src/lib/db/queries/hybrid-search.ts`, change the `semantic_results` CTE (lines 107-113) from:

```sql
SELECT id, 1.0 - (qwen_4b_fp16_embedding <=> ...) AS vec_score
FROM bookmarks
WHERE qwen_4b_fp16_embedding IS NOT NULL
ORDER BY qwen_4b_fp16_embedding <=> ... LIMIT 50
```

To:

```sql
SELECT entity_id AS id, 1.0 - (qwen_4b_fp16_embedding <=> ...) AS vec_score
FROM embeddings
WHERE domain = 'bookmark' AND qwen_4b_fp16_embedding IS NOT NULL
ORDER BY qwen_4b_fp16_embedding <=> ... LIMIT 50
```

**Step 2: Update hybridSearchThoughts**

Same change for the thoughts semantic CTE (lines 244-251): query `embeddings WHERE domain = 'thought'` instead of `thoughts.qwen_4b_fp16_embedding`.

**Step 3: Update semanticSearchBookmarks**

Change to query `embeddings WHERE domain = 'bookmark'`.

**Step 4: Update imports**

Replace `BOOKMARK_EMBEDDING_DIMENSIONS` / `THOUGHT_EMBEDDING_DIMENSIONS` imports with `CONTENT_EMBEDDING_DIMENSIONS` from `@/lib/db/schema/content-embeddings`.

**Step 5: Run tests**

Run: `bun run test`
Run: `bun run type-check`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/db/queries/hybrid-search.ts
git commit -m "refactor(search): query embeddings table for semantic search layer"
```

---

### Task 4: Update Bookmark Embedding Backfill to Write to embeddings

**Files:**

- Modify: `src/lib/db/mutations/bookmark-embeddings.ts`
- Modify: `scripts/backfill-domain-embeddings.node.mjs`

**Step 1: Update the TypeScript backfill**

In `src/lib/db/mutations/bookmark-embeddings.ts`, change the UPDATE target (around line 296):

From:

```typescript
await db
  .update(bookmarks)
  .set({ qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)) })
  .where(eq(bookmarks.id, row.id));
```

To:

```typescript
await db
  .insert(embeddings)
  .values({
    domain: "bookmark",
    entityId: row.id,
    title: row.title,
    contentDate: row.dateBookmarked,
    qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
    updatedAt: Date.now(),
  })
  .onConflictDoUpdate({
    target: [embeddings.domain, embeddings.entityId],
    set: {
      qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
      title: row.title,
      updatedAt: Date.now(),
    },
  });
```

Also update `readMissingEmbeddingRows` to LEFT JOIN embeddings to find bookmarks without embeddings:

```sql
SELECT b.* FROM bookmarks b
LEFT JOIN embeddings ce ON ce.domain = 'bookmark' AND ce.entity_id = b.id
WHERE ce.entity_id IS NULL
```

**Step 2: Update the Node.js backfill script**

In `scripts/backfill-domain-embeddings.node.mjs`, change all UPDATE targets from domain tables to `embeddings`:

```javascript
await sqlClient`INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
VALUES ('thought', ${row.id}, ${row.title}, ${row.created_at}, ${serializeHalfvec(embedding)}::halfvec(2560), ${Date.now()})
ON CONFLICT (domain, entity_id) DO UPDATE
SET qwen_4b_fp16_embedding = ${serializeHalfvec(embedding)}::halfvec(2560), updated_at = ${Date.now()}`;
```

**Step 3: Update existing tests**

Update `__tests__/lib/db/mutations/bookmark-embeddings.test.ts` if it exists.

**Step 4: Commit**

```bash
git add src/lib/db/mutations/bookmark-embeddings.ts scripts/backfill-domain-embeddings.node.mjs
git commit -m "refactor(embeddings): write all embeddings to unified embeddings table"
```

---

### Task 5: Remove Embedding Columns from Existing Domain Tables

After verifying hybrid search and backfill work against embeddings.

**Files:**

- Modify: `src/lib/db/schema/bookmarks.ts` — remove `qwen4bFp16Embedding` column, HNSW index, embedding constants
- Modify: `src/lib/db/schema/thoughts.ts` — same
- Modify: `src/lib/db/schema/ai-analysis.ts` — same
- Modify: `src/lib/db/schema/opengraph.ts` — same
- Generate: new Drizzle migration (ALTER TABLE DROP COLUMN)

**Step 1: Remove columns from schema files**

In each schema file:

- Delete the `qwen4bFp16Embedding` halfvec column definition
- Delete the HNSW index definition
- Delete the `*_EMBEDDING_MODEL`, `*_EMBEDDING_DIMENSIONS`, `*_EMBEDDING_GGUF_URL` constants
- Delete the `halfvec` import if no longer used

**Step 2: Update any remaining imports**

Search for any code that imports `BOOKMARK_EMBEDDING_DIMENSIONS`, `THOUGHT_EMBEDDING_DIMENSIONS`, etc. Replace with `CONTENT_EMBEDDING_DIMENSIONS` from `content-embeddings.ts`.

Run: `bun run type-check` to find all broken references.

**Step 3: Generate migration**

Run: `bunx drizzle-kit generate`
Expected: Migration with `ALTER TABLE ... DROP COLUMN qwen_4b_fp16_embedding` and `DROP INDEX` for each table.

**Step 4: Run all tests**

Run: `bun run test`
Run: `bun run validate`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/schema/ drizzle/
git commit -m "refactor(db): remove per-domain embedding columns, consolidate to embeddings"
```

---

## Phase 2: Domain Migrations

Each domain migration creates a new PostgreSQL table with FTS + trigram (no embedding column). Embedding input builders write to `embeddings`.

### Task 6: Investments Schema, Seed & Data Access

The simplest domain — static data, few columns. Establishes the pattern.

**Files:**

- Create: `src/lib/db/schema/investments.ts`
- Create: `src/lib/db/mutations/investments.ts`
- Create: `src/lib/db/queries/investments.ts`
- Create: `src/lib/db/mutations/investment-embeddings.ts`
- Create: `scripts/seed-investments.node.mjs`
- Modify: `drizzle.config.ts` (add `"investments"` to `tablesFilter`)
- Modify: `scripts/backfill-domain-embeddings.node.mjs` (add investments handler)
- Test: `__tests__/lib/db/schema/investments.test.ts`, `__tests__/lib/db/queries/investments.test.ts`, `__tests__/lib/db/mutations/investment-embeddings.test.ts`

**Step 1: Write schema**

Create `src/lib/db/schema/investments.ts`:

- `tsvector` custom type (local definition, same as bookmarks.ts:36-40)
- Table columns: id, name, slug (unique), description, type, stage, category, status, operating_status, invested_year, location, website, logo, metrics (jsonb), details (jsonb)
- `search_vector` tsvector GENERATED ALWAYS: A=name, B=description, C=category+stage
- **No embedding column** — embeddings are in embeddings
- Indexes: GIN on search_vector, gin_trgm_ops on name, unique on slug

**Step 2: Add to drizzle.config.ts, generate migration**

**Step 3: Write mutations and queries**

- `upsertInvestments()` — batch upsert with `onConflictDoUpdate` on `id`
- `getInvestments()` — SELECT all, ordered by invested_year DESC
- `getInvestmentBySlug(slug)` — single lookup

**Step 4: Write seed script**

`scripts/seed-investments.node.mjs` — reads `data/investments.ts`, upserts into DB. Node.js only for SSL.

**Step 5: Write embedding input builder**

`src/lib/db/mutations/investment-embeddings.ts`:

- `buildInvestmentEmbeddingInput(row): string` — Name, Description, Category, Stage, Status, Location
- Writes to `embeddings` with `domain = 'investment'`

**Step 6: Add investments handler to backfill script**

Add `backfillInvestments()` and `--investments` CLI flag to `scripts/backfill-domain-embeddings.node.mjs`. Reads from `investments` table, writes embeddings to `embeddings`.

**Step 7: Write tests**

- Schema test: verify column names, no embedding column
- Query test: mock DB, verify query shapes
- Embedding input test: verify text layout and priority order

**Step 8: Run tests and commit**

Run: `bun run test __tests__/lib/db/schema/investments.test.ts __tests__/lib/db/queries/investments.test.ts __tests__/lib/db/mutations/investment-embeddings.test.ts`

```bash
git add src/lib/db/schema/investments.ts src/lib/db/mutations/ src/lib/db/queries/investments.ts scripts/ drizzle.config.ts drizzle/ __tests__/ package.json
git commit -m "feat(db): add investments table with FTS/trigram and unified embedding support"
```

---

### Task 7: Projects Schema, Seed & Data Access

Same pattern as investments.

**Files:**

- Create: `src/lib/db/schema/projects.ts`, `src/lib/db/mutations/projects.ts`, `src/lib/db/queries/projects.ts`, `src/lib/db/mutations/project-embeddings.ts`, `scripts/seed-projects.node.mjs`
- Modify: `drizzle.config.ts`, `scripts/backfill-domain-embeddings.node.mjs`
- Test: `__tests__/lib/db/schema/projects.test.ts`, `__tests__/lib/db/queries/projects.test.ts`, `__tests__/lib/db/mutations/project-embeddings.test.ts`

**Step 1-8:** Follow identical pattern as Task 6. Schema columns: id, name, slug, description, short_summary, url, github_url, image_key, tags (jsonb), tech_stack (jsonb), note, cv_featured. FTS: A=name, B=short_summary+description, C=tags. Embedding input: Name, ShortSummary, Description, Tags, TechStack, Note.

**Note on tsvector with jsonb tags:** Since `tags` is jsonb, use `to_tsvector('english', coalesce(tags::text, ''))` in the GENERATED ALWAYS expression.

```bash
git commit -m "feat(db): add projects table with FTS/trigram and unified embedding support"
```

---

### Task 8: Books Schema — Individual Rows

Normalize from JSONB blob to individual rows.

**Files:**

- Create: `src/lib/db/schema/books-individual.ts`
- Create: `src/lib/db/mutations/books-individual.ts`, `src/lib/db/queries/books-individual.ts`
- Create: `src/lib/db/mutations/book-embeddings.ts`
- Create: `scripts/sync-books-to-individual.node.mjs` (reads existing JSONB, writes individual rows)
- Modify: `drizzle.config.ts`, `scripts/backfill-domain-embeddings.node.mjs`
- Modify: `src/lib/books/books-data-access.server.ts` (switch read path)
- Test: `__tests__/lib/db/schema/books-individual.test.ts`, `__tests__/lib/db/queries/books-individual.test.ts`, `__tests__/lib/db/mutations/book-embeddings.test.ts`

**Step 1: Write schema**

Table `books`, columns: id (ABS UUID), slug (unique), title, subtitle, authors (jsonb), publisher, published_year, genres (jsonb), description, formats (jsonb), audio_narrators (jsonb), audio_duration_seconds, cover_url, ai_summary, thoughts_text, external_links (jsonb). FTS: A=title, B=subtitle+authors, C=genres+description. No embedding column.

**Step 2: Write sync script**

`scripts/sync-books-to-individual.node.mjs`:

- Reads the current `books_snapshots.payload` JSONB blob
- Merges enrichments from `data/book-enrichments.ts`
- Inserts individual rows into `books` table
- Upsert on `id`

**Step 3: Switch read path**

Modify `src/lib/books/books-data-access.server.ts`: change `readBooksFromDb()` to query the new `books` table instead of the JSONB blob.

**Step 4: Write embedding input builder**

`buildBookEmbeddingInput(row)`: Title, Subtitle, Authors, Genres, Publisher, Description, AiSummary, Thoughts (last). Writes to `embeddings` with `domain = 'book'`.

**Step 5: Tests, commit**

```bash
git commit -m "feat(db): add individual books table with FTS/trigram, migrate from JSONB blob"
```

---

### Task 9: Blog Posts Schema, Sync & Data Access

MDX files → PostgreSQL. Most complex migration due to frontmatter parsing.

**Files:**

- Create: `src/lib/db/schema/blog-posts.ts`
- Create: `src/lib/db/mutations/blog-posts.ts`, `src/lib/db/queries/blog-posts.ts`
- Create: `src/lib/db/mutations/blog-post-embeddings.ts`
- Create: `scripts/sync-blog-posts.node.mjs`
- Modify: `drizzle.config.ts`, `scripts/backfill-domain-embeddings.node.mjs`
- Test: `__tests__/lib/db/schema/blog-posts.test.ts`, `__tests__/lib/db/queries/blog-posts.test.ts`, `__tests__/lib/db/mutations/blog-post-embeddings.test.ts`

**Step 1: Write schema**

Table `blog_posts`. Columns: id (`"mdx-{slug}"`), slug (unique), title, excerpt, raw_content (text — for search/embedding), author_id, tags (jsonb), published_at (text ISO date), updated_at, reading_time, cover_image, draft (boolean). FTS: A=title, B=excerpt, C=tags, D=raw_content. No embedding column.

**Step 2: Write sync script**

`scripts/sync-blog-posts.node.mjs`:

- Reads all `.mdx` files from `data/blog/posts/`
- Parses frontmatter with `gray-matter`
- Extracts slug, title, excerpt, tags, author, dates, readingTime, coverImage, draft
- Reads raw MDX body (post-frontmatter)
- Upserts into `blog_posts` on slug

**Step 3: Write embedding input builder**

`buildBlogPostEmbeddingInput(row)`: Title, Excerpt, Tags, Author, RawContent (last). Writes to `embeddings` with `domain = 'blog'`.

**Step 4: Tests, commit**

```bash
git commit -m "feat(db): add blog_posts table with FTS/trigram and MDX sync script"
```

---

### Task 10: Run All Migrations, Seed & Backfill

Manual/operational task — execute against production.

**Step 1:** Run Drizzle migrations: `bunx drizzle-kit migrate`
**Step 2:** Seed investments: `node scripts/seed-investments.node.mjs`
**Step 3:** Seed projects: `node scripts/seed-projects.node.mjs`
**Step 4:** Sync books: `node scripts/sync-books-to-individual.node.mjs`
**Step 5:** Sync blog posts: `node scripts/sync-blog-posts.node.mjs`
**Step 6:** Backfill embeddings: `node scripts/backfill-domain-embeddings.node.mjs --investments --projects --books --blog`
**Step 7:** Verify:

```sql
SELECT domain, count(*) FROM embeddings GROUP BY domain ORDER BY domain;
```

Expected: all domains populated with embeddings.

---

## Phase 3: Unified Hybrid Search

### Task 11: Generic Hybrid Search Builder

Extract the 3-CTE pattern into a reusable module. FTS/trigram on domain table, semantic on embeddings.

**Files:**

- Create: `src/lib/db/queries/hybrid-search-builder.ts`
- Test: `__tests__/lib/db/queries/hybrid-search-builder.test.ts`

**Step 1: Design the interface**

```typescript
export interface HybridSearchConfig {
  domainTable: PgTable; // the domain-specific table (for FTS + trigram)
  domainName: ContentEmbeddingDomain; // for embeddings WHERE domain = ?
  searchVectorColumn: PgColumn; // domain_table.search_vector
  titleColumn: PgColumn; // domain_table.title (for trigram)
  idColumn: PgColumn; // domain_table.id (for joining)
  additionalWhere?: SQL; // e.g., draft = false
}

export async function hybridSearch(
  config: HybridSearchConfig,
  options: { query: string; embedding?: number[]; limit?: number },
): Promise<Array<{ id: string; score: number }>>;
```

**Step 2: Implement the 3-CTE SQL**

The SQL follows the existing pattern from `hybrid-search.ts` but parameterized:

- CTE 1 (`keyword_results`): FTS + trigram on `config.domainTable`
- CTE 2 (`semantic_results`): cosine distance on `embeddings WHERE domain = config.domainName`
- CTE 3 (`combined`): FULL OUTER JOIN, weighted score (FTS×2.0 + trgm×0.5 + vec×10.0)

**Step 3: Tests and commit**

```bash
git commit -m "feat(search): add generic hybrid search builder (FTS+trigram on domain, semantic on embeddings)"
```

---

### Task 12: Per-Domain Hybrid Search Functions

Wire each new domain through the generic builder.

**Files:**

- Create: `src/lib/db/queries/hybrid-search-investments.ts`
- Create: `src/lib/db/queries/hybrid-search-projects.ts`
- Create: `src/lib/db/queries/hybrid-search-books.ts`
- Create: `src/lib/db/queries/hybrid-search-blog.ts`
- Test: one test file per domain

Each file exports `hybridSearch<Domain>({ query, embedding?, limit? })` that calls the generic builder with the domain's table and config, then JOINs back to the domain table to hydrate full rows.

```bash
git commit -m "feat(search): add per-domain hybrid search for investments, projects, books, blog"
```

---

### Task 13: Migrate Existing Hybrid Search to Generic Builder

Refactor the existing bookmark and thought search to use the generic builder.

**Files:**

- Modify: `src/lib/db/queries/hybrid-search.ts` — rewrite `hybridSearchBookmarks` and `hybridSearchThoughts` to delegate to the generic builder

This eliminates the duplicated raw SQL. Both functions become thin wrappers:

```typescript
export async function hybridSearchBookmarks(options) {
  const ids = await hybridSearch(BOOKMARK_SEARCH_CONFIG, options);
  // JOIN bookmarks table, map to UnifiedBookmark
}
```

```bash
git commit -m "refactor(search): migrate bookmark/thought hybrid search to generic builder"
```

---

### Task 14: Replace MiniSearch Searchers

Replace MiniSearch-based search functions with PostgreSQL hybrid search.

**Files:**

- Modify: `src/lib/search/searchers/static-searchers.ts` — rewrite `searchInvestments`, `searchProjects`
- Modify: `src/lib/search/searchers/dynamic-searchers.ts` — rewrite `searchBooks`
- Create: `src/lib/search/searchers/blog-search.ts`
- Modify: `src/lib/search/index.ts` — update exports
- Modify: `__tests__/lib/search/search.test.ts`

For each domain:

- Remove `createCachedSearchFunction` usage
- Call `buildQueryEmbedding(query)` with 1500ms timeout
- Call `hybridSearch<Domain>({ query, embedding, limit })`
- Map results to `SearchResult[]`
- Remove `hybridRerank` config

Keep `searchExperience` and `searchEducation` on MiniSearch (deferred per non-goals).

```bash
git commit -m "feat(search): replace MiniSearch with PostgreSQL hybrid search for investments, projects, books, blog"
```

---

### Task 15: Update Search API Routes

**Files:**

- Modify: `src/app/api/search/all/route.ts` — update imports, add blog search
- Modify: `src/app/api/search/[scope]/route.ts` — add blog scope
- Modify: `__tests__/api/search-api.integration.test.ts`

```bash
git commit -m "feat(search): wire hybrid search into API routes, add blog search scope"
```

---

### Task 16: Remove MiniSearch Infrastructure

Delete now-unused MiniSearch layer.

**Files to delete:**

- `src/lib/search/search-factory.ts` — `createCachedSearchFunction`
- `src/lib/search/search-content.ts` — `searchContent()`, `rerankScoredResultsWithEmbeddings()`
- `src/lib/search/index-builder.ts` — MiniSearch index building
- `src/lib/search/index-factory.ts`
- `src/lib/search/config.ts` — MiniSearch field configs
- `src/lib/search/loaders/static-content.ts` — MiniSearch index loaders
- `src/lib/search/loaders/dynamic-content.ts`
- Related test files that only test MiniSearch internals

**Files to modify:**

- `src/lib/search/index.ts` — remove dead re-exports
- Remaining searcher files — remove dead imports

**Verification:**
Run: `bun run type-check && bun run validate && bun run test`

```bash
git commit -m "refactor(search): remove MiniSearch infrastructure, search-factory, and rerank layer"
```

---

## Phase 4: Embedding-Based Related Content

### Task 17: Cross-Domain Similarity Query

The core query — finds nearest neighbors across ALL domains with a single HNSW traversal.

**Files:**

- Create: `src/lib/db/queries/cross-domain-similarity.ts`
- Test: `__tests__/lib/db/queries/cross-domain-similarity.test.ts`

**Step 1: Write the function**

```typescript
export interface SimilarityCandidate {
  domain: ContentEmbeddingDomain;
  entityId: string;
  title: string;
  similarity: number;
  contentDate: string | null;
}

export async function findSimilarContent(options: {
  sourceEmbedding: number[];
  sourceDomain: ContentEmbeddingDomain;
  sourceId: string;
  limit?: number; // default 30 (fetch extra for diversity re-ranking)
}): Promise<SimilarityCandidate[]>;
```

The SQL is a single query — no UNION ALL:

```sql
SELECT domain, entity_id, title, content_date,
  1.0 - (qwen_4b_fp16_embedding <=> $source_vec) AS similarity
FROM embeddings
WHERE NOT (domain = $src_domain AND entity_id = $src_id)
  AND qwen_4b_fp16_embedding IS NOT NULL
ORDER BY qwen_4b_fp16_embedding <=> $source_vec
LIMIT $limit;
```

**Step 2: Write tests**

- Self-exclusion works
- Results span multiple domains
- Sorted by similarity descending

```bash
git commit -m "feat(similarity): add single-query cross-domain similarity on embeddings"
```

---

### Task 18: Blended Scoring Module

**Files:**

- Create: `src/lib/content-graph/blended-scoring.ts`
- Test: `__tests__/lib/content-graph/blended-scoring.test.ts`

```typescript
export function applyBlendedScoring(
  candidates: SimilarityCandidate[],
  options?: { maxPerDomain?: number; maxTotal?: number },
): ScoredCandidate[];
```

- Cosine: 0.70 × cosineSimilarity
- Recency: 0.10 × recencyScore(contentDate)
- Quality: 0.10 × qualityScore
- Diversity: 0.10 reserved for post-processing re-rank (cap per domain)

**Test extensively:** pure cosine ranking, recency boost, diversity cap, edge cases.

```bash
git commit -m "feat(similarity): add blended scoring with cosine, recency, and diversity signals"
```

---

### Task 19: Replace Heuristic Engine in buildContentGraph

**Files:**

- Modify: `src/lib/content-graph/build.ts`
- Modify: `__tests__/lib/content-graph.test.ts`

Replace the `aggregateAllContent()` + `findMostSimilar()` loop (lines 126-198) with:

1. Read all rows from `embeddings` that have embeddings
2. For each row, call `findSimilarContent()` with the stored embedding
3. Apply `applyBlendedScoring()`
4. Store in `relatedContentMappings` using same `"<type>:<id>"` key format
5. Remove imports of `aggregateAllContent`, `findMostSimilar`, `DEFAULT_WEIGHTS`

```bash
git commit -m "feat(content-graph): replace heuristic similarity with single-query pgvector cosine"
```

---

### Task 20: Update RelatedContent Server Component

**Files:**

- Modify: `src/components/features/related-content/related-content.server.tsx`
- Create: `src/lib/db/queries/content-hydration.ts` (batch hydration from domain tables)

**Step 1: Create content hydration module**

`src/lib/db/queries/content-hydration.ts`:

- `hydrateRelatedContentItems(entries: Array<{domain, entityId}>): Promise<RelatedContentItem[]>`
- Batches queries per domain type, fetches full display data from each domain table
- Replaces the `aggregateAllContent()` call for display hydration

**Step 2: Simplify the server component**

- Use `hydrateRelatedContentItems()` instead of `aggregateAllContent()` + lazy content map
- Replace heuristic fallback (lines 370-414) with `findSimilarContent()` using source item's embedding from embeddings

```bash
git commit -m "refactor(related-content): hydrate from domain tables, remove aggregator dependency"
```

---

### Task 21: Remove Heuristic Similarity Engine

**Files to delete:**

- `src/lib/content-similarity/index.ts`
- `src/lib/content-similarity/aggregator.ts`
- `src/lib/content-similarity/cached-aggregator.ts`
- `src/lib/content-similarity/tag-ontology.ts`

**Files to modify:**

- `src/app/api/related-content/route.ts` — replace with `findSimilarContent()` + `applyBlendedScoring()`
- Any remaining imports

Run: `bun run type-check && bun run validate && bun run test`

```bash
git commit -m "refactor: remove heuristic content-similarity engine (replaced by pgvector cosine)"
```

---

## Phase 5: Cleanup & Verification

### Task 22: Update Documentation

**Modify:**

- `docs/features/search.md` — rewrite for unified hybrid search + embeddings architecture
- `docs/architecture/README.md` — add embeddings table, new domain tables
- `docs/file-map.md` — add new files, remove deleted files

**Delete:**

- `docs/architecture/chroma.md` — Chroma was removed long ago

```bash
git commit -m "docs: update search and architecture docs for unified embedding similarity"
```

---

### Task 23: Full Validation & Build

**Step 1:** `bun run validate` — 0 errors, 0 warnings
**Step 2:** `bun run type-check && bun run type-check:tests`
**Step 3:** `bun run test` — all pass
**Step 4:** `bun run build` — production build succeeds
**Step 5:** `bun run check:file-size` — all new files <= 350 lines

```bash
git commit -m "chore: fix validation issues from embedding similarity upgrade"
```

---

### Task 24: Manual Quality Verification

**Search quality:**

- "vector database" → should return bookmarks, blog posts, thoughts about pgvector/embeddings
- "venture capital" → investments and related bookmarks
- "Next.js" → projects, blog posts, bookmarks

**Related content quality:**

- Bookmark about AI/ML → related items across all domains on same topic
- Blog post → bookmarks and thoughts on same topic
- Investment → bookmarks about that company/sector

**Compare with baseline:**

- Pick 5-10 content items, record current heuristic suggestions
- After upgrade, record new embedding-based suggestions
- Verify semantic quality improvement

---

## Summary

| Phase                       | Tasks       | Key Outcome                                                             |
| --------------------------- | ----------- | ----------------------------------------------------------------------- |
| Phase 1: Unified Embeddings | Tasks 1-5   | `embeddings` table, existing data migrated, per-domain columns removed  |
| Phase 2: Domain Migrations  | Tasks 6-10  | Investments, projects, books, blog posts in PostgreSQL with FTS/trigram |
| Phase 3: Hybrid Search      | Tasks 11-16 | Unified 3-CTE search, MiniSearch removed                                |
| Phase 4: Related Content    | Tasks 17-21 | Single-query pgvector cosine similarity, heuristic engine removed       |
| Phase 5: Cleanup            | Tasks 22-24 | Docs updated, all checks pass, quality verified                         |

**Total: 24 tasks across 5 phases.**
