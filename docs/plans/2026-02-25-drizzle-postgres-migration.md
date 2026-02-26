# Drizzle + PostgreSQL Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all S3 JSON persistence/retrieval with PostgreSQL via Drizzle ORM, using the PG 18 instance at `167.234.219.57:5438` with 3-layer hybrid search (FTS + trigram + pgvector).

**Architecture:** Drizzle schema is the single source of truth for types (Option A). Existing Zod schemas in `src/types/schemas/` are retired entity-by-entity as Drizzle tables replace them. The data access layer (`src/lib/data-access/`, `src/lib/bookmarks/`) is surgically edited to swap S3 JSON reads/writes for Drizzle queries. S3 stays for binary assets (images, OG cache). Blog MDX files stay on filesystem.

**Tech Stack:** Drizzle ORM (`drizzle-orm`), `postgres` driver (postgres.js), `drizzle-kit` (dev), PostgreSQL 18.2 with pgvector 0.8.2, pg_trgm, unaccent, btree_gin, fuzzystrmatch, pg_stat_statements.

---

## Pre-Flight Checklist

- [ ] Read `docs/standards/code-change.md` before any edit [FS1a]
- [ ] Confirm `bun run validate` passes on current `dev` branch before starting
- [ ] Confirm PG 18 instance is accessible: `psql "postgres://...@167.234.219.57:5438/postgres?sslmode=require" -c "SELECT 1;"`
- [ ] Extensions verified: vector 0.8.2, pg_trgm 1.6, unaccent 1.1, btree_gin 1.3, fuzzystrmatch 1.2, pg_stat_statements 1.12

---

## Task 1: Install Dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install packages**

```bash
bun add drizzle-orm postgres
bun add -D drizzle-kit
```

**Dependency Compliance (DEP-VER):**

- `drizzle-orm` — TypeScript ORM; exports `halfvec`, `vector`, `sparsevec` natively from `drizzle-orm/pg-core`
- `postgres` — postgres.js driver; zero-dependency, bun-native, supports SSL
- `drizzle-kit` — dev-only CLI for `push`, `generate`, `migrate`, `studio`

**Step 2: Verify installation**

```bash
bun run validate
```

Expected: passes (no code changes yet, just new deps)

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add drizzle-orm, postgres driver, drizzle-kit"
```

---

## Task 2: Database Connection

**Files:**

- Create: `src/lib/db/connection.ts`
- Create: `drizzle.config.ts` (project root)

**Step 1: Create connection module**

```typescript
// src/lib/db/connection.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});

export const db = drizzle(client);
export type Database = typeof db;
```

**Step 2: Create drizzle.config.ts at project root**

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 3: Verify typecheck**

```bash
bun run type-check
```

Expected: passes (no consumers yet)

**Step 4: Commit**

```bash
git add src/lib/db/connection.ts drizzle.config.ts
git commit -m "feat(db): add Drizzle connection and drizzle-kit config"
```

**ENV Note [ENV1a]:** `DATABASE_URL` is a new required env var. Add to `.env-example` with placeholder. Value: `postgres://postgres:<password>@167.234.219.57:5438/postgres?sslmode=require`. Get explicit user approval before committing code that depends on it.

---

## Task 3: Bookmark Schema (Drizzle as Source of Truth)

**Files:**

- Create: `src/lib/db/schema/bookmarks.ts`
- Create: `src/lib/db/schema/index.ts`

**Context:** The `UnifiedBookmark` Zod schema (`src/types/schemas/bookmark.ts`) has ~35 fields. The Drizzle table must capture all fields needed for DB queries. Nested JSON objects (`content`, `tags`, `logoData`, `assets`) are stored as `jsonb` columns.

**Step 1: Create bookmark schema**

```typescript
// src/lib/db/schema/bookmarks.ts
import { pgTable, text, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { halfvec } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";
import type { BookmarkContent, BookmarkTag, BookmarkAsset } from "@/types/schemas/bookmark";
import type { LogoData } from "@/types/schemas/bookmark";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    // Identity
    id: text("id").primaryKey(), // external ID from Hoarder API
    slug: text("slug").notNull().unique(),
    url: text("url").notNull(),

    // Content (text fields for FTS)
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    note: text("note"),
    summary: text("summary"),

    // Nested data as JSONB
    tags: jsonb("tags").$type<BookmarkTag[]>().notNull().default([]),
    content: jsonb("content").$type<BookmarkContent>(),
    assets: jsonb("assets").$type<BookmarkAsset[]>(),
    logoData: jsonb("logo_data").$type<LogoData | null>(),
    registryLinks:
      jsonb("registry_links").$type<
        Array<{ registry: string; url: string; packageName: string }>
      >(),

    // OG metadata
    ogImage: text("og_image"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogUrl: text("og_url"),
    ogImageExternal: text("og_image_external"),
    ogImageLastFetchedAt: text("og_image_last_fetched_at"),
    ogImageEtag: text("og_image_etag"),

    // Metrics
    readingTime: integer("reading_time"),
    wordCount: integer("word_count"),

    // Flags
    archived: boolean("archived").default(false),
    isPrivate: boolean("is_private").default(false),
    isFavorite: boolean("is_favorite").default(false),
    taggingStatus: text("tagging_status"),

    // Domain
    domain: text("domain"),

    // Timestamps (stored as text to match existing ISO format)
    dateBookmarked: text("date_bookmarked").notNull(),
    datePublished: text("date_published"),
    dateCreated: text("date_created"),
    dateUpdated: text("date_updated"),
    modifiedAt: text("modified_at"),
    sourceUpdatedAt: text("source_updated_at").notNull(),

    // --- Hybrid Search Columns ---

    // Layer 1: Full-text search (auto-computed)
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
      setweight(to_tsvector('english', unaccent(coalesce(${bookmarks.title}, ''))), 'A') ||
      setweight(to_tsvector('english', unaccent(coalesce(${bookmarks.description}, ''))), 'B') ||
      setweight(to_tsvector('english', unaccent(coalesce(${bookmarks.summary}, ''))), 'C') ||
      setweight(to_tsvector('english', unaccent(coalesce(${bookmarks.note}, ''))), 'D')
    `,
    ),

    // Layer 3: Semantic embedding (Qwen3-Embedding-4B at 1024 dims)
    embedding: halfvec("embedding", { dimensions: 1024 }),
  },
  (t) => [
    // FTS index
    index("idx_bookmarks_search_vector").using("gin", t.searchVector),
    // Semantic index
    index("idx_bookmarks_embedding").using("hnsw", t.embedding.op("halfvec_cosine_ops")),
    // Trigram index on title for fuzzy matching (Layer 2)
    index("idx_bookmarks_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
    // Trigram index on slug for fuzzy matching
    index("idx_bookmarks_slug_trgm").using("gin", sql`${t.slug} gin_trgm_ops`),
    // Lookup indexes
    index("idx_bookmarks_domain").on(t.domain),
    index("idx_bookmarks_date_bookmarked").on(t.dateBookmarked),
  ],
);

// Drizzle-derived types (Option A: schema is source of truth)
export type BookmarkRow = typeof bookmarks.$inferSelect;
export type BookmarkInsert = typeof bookmarks.$inferInsert;
```

**Step 2: Create schema barrel**

```typescript
// src/lib/db/schema/index.ts
export { bookmarks, type BookmarkRow, type BookmarkInsert } from "./bookmarks";
```

**Step 3: Verify typecheck**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git add src/lib/db/schema/
git commit -m "feat(db): add bookmarks Drizzle schema with hybrid search columns"
```

---

## Task 4: Push Schema to PG 18

**Step 1: Push schema**

```bash
DATABASE_URL="postgres://postgres:Upd3YV2nuh1ODzx15QLhPyjivmuMh3nhFx8dFi9uN8Y3fnyGxAUI50r1WLbPN9tA@167.234.219.57:5438/postgres?sslmode=require" bun drizzle-kit push
```

Expected: creates `bookmarks` table with all columns and indexes.

**Step 2: Verify in psql**

```bash
psql "postgres://...@167.234.219.57:5438/postgres?sslmode=require" \
  -c "\d bookmarks" \
  -c "\di+ idx_bookmarks_*"
```

Expected: table with all columns, indexes created.

**Step 3: Verify extension-dependent columns work**

```sql
-- Test tsvector generation
INSERT INTO bookmarks (id, slug, url, title, description, date_bookmarked, source_updated_at)
VALUES ('test-1', 'test-slug', 'https://example.com', 'Test Title', 'Test description', '2026-02-25', '2026-02-25');

SELECT id, search_vector FROM bookmarks WHERE id = 'test-1';
-- Expected: search_vector populated with weighted tsvector

DELETE FROM bookmarks WHERE id = 'test-1';
```

---

## Task 5: Bookmark Data Access — Read Path

**Files:**

- Create: `src/lib/db/queries/bookmarks.ts` (query functions)
- Modify: `src/lib/bookmarks/bookmarks-data-access.server.ts` (swap S3 reads for DB reads)

**Context:** This is the surgical replacement. The data access layer currently calls `readBookmarksDatasetFromS3()`, `readBookmarksPageFromS3()`, etc. We replace these with Drizzle queries that return the same types.

**Step 1: Create query module**

```typescript
// src/lib/db/queries/bookmarks.ts
import { db } from "@/lib/db/connection";
import { bookmarks, type BookmarkRow } from "@/lib/db/schema";
import { eq, desc, sql, ilike, arrayContains } from "drizzle-orm";

export async function getAllBookmarks(): Promise<BookmarkRow[]> {
  return db.select().from(bookmarks).orderBy(desc(bookmarks.dateBookmarked));
}

export async function getBookmarkById(id: string): Promise<BookmarkRow | null> {
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getBookmarksPage(page: number, pageSize: number): Promise<BookmarkRow[]> {
  const offset = (page - 1) * pageSize;
  return db
    .select()
    .from(bookmarks)
    .orderBy(desc(bookmarks.dateBookmarked))
    .limit(pageSize)
    .offset(offset);
}

export async function getBookmarksCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` }).from(bookmarks);
  return result[0]?.count ?? 0;
}

export async function searchBookmarksFTS(query: string): Promise<BookmarkRow[]> {
  return db
    .select()
    .from(bookmarks)
    .where(sql`${bookmarks.searchVector} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(
      sql`ts_rank_cd(${bookmarks.searchVector}, websearch_to_tsquery('english', ${query})) DESC`,
    )
    .limit(50);
}
```

**Step 2: Write test for query module**

Create `src/lib/db/queries/__tests__/bookmarks.test.ts` following patterns in existing `__tests__/` dirs.
Test: `getAllBookmarks` returns array, `getBookmarkById` returns null for missing ID (mock db).

**Step 3: Run tests**

```bash
bun run test src/lib/db/queries/__tests__/bookmarks.test.ts
```

**Step 4: Commit**

```bash
git add src/lib/db/queries/
git commit -m "feat(db): add bookmark query functions with FTS search"
```

---

## Task 6: Bookmark Data Access — Write Path

**Files:**

- Create: `src/lib/db/mutations/bookmarks.ts`
- Modify: `src/lib/bookmarks/persistence.server.ts` (swap S3 writes for DB writes)

**Step 1: Create mutation module**

```typescript
// src/lib/db/mutations/bookmarks.ts
import { db } from "@/lib/db/connection";
import { bookmarks, type BookmarkInsert } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function upsertBookmark(data: BookmarkInsert): Promise<void> {
  await db
    .insert(bookmarks)
    .values(data)
    .onConflictDoUpdate({
      target: bookmarks.id,
      set: {
        title: data.title,
        description: data.description,
        slug: data.slug,
        url: data.url,
        tags: data.tags,
        content: data.content,
        assets: data.assets,
        logoData: data.logoData,
        ogImage: data.ogImage,
        ogTitle: data.ogTitle,
        ogDescription: data.ogDescription,
        summary: data.summary,
        note: data.note,
        domain: data.domain,
        dateUpdated: data.dateUpdated,
        modifiedAt: data.modifiedAt,
        sourceUpdatedAt: data.sourceUpdatedAt,
      },
    });
}

export async function upsertBookmarks(data: BookmarkInsert[]): Promise<void> {
  if (data.length === 0) return;
  // Batch in groups of 100 to avoid query size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(upsertBookmark));
  }
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.delete(bookmarks).where(eq(bookmarks.id, id));
}
```

**Step 2: Write test, run, verify**

```bash
bun run test src/lib/db/mutations/__tests__/bookmarks.test.ts
```

**Step 3: Commit**

```bash
git add src/lib/db/mutations/
git commit -m "feat(db): add bookmark mutation functions (upsert, delete)"
```

---

## Task 7: Data Migration Script (S3 -> PostgreSQL)

**Files:**

- Create: `scripts/migrate-s3-to-postgres.ts`

**Context:** One-time script to read all bookmarks from S3 and insert into PostgreSQL. Run manually.

**Step 1: Create migration script**

```typescript
// scripts/migrate-s3-to-postgres.ts
import { readBookmarksDatasetFromS3 } from "@/lib/bookmarks/bookmarks-s3-store";
import { upsertBookmarks } from "@/lib/db/mutations/bookmarks";
import type { BookmarkInsert } from "@/lib/db/schema";

async function migrate() {
  console.log("Reading bookmarks from S3...");
  const bookmarks = await readBookmarksDatasetFromS3();
  if (!bookmarks || bookmarks.length === 0) {
    console.error("No bookmarks found in S3");
    process.exit(1);
  }
  console.log(`Found ${bookmarks.length} bookmarks. Inserting into PostgreSQL...`);

  // Map UnifiedBookmark -> BookmarkInsert
  const inserts: BookmarkInsert[] = bookmarks.map((b) => ({
    id: b.id,
    slug: b.slug,
    url: b.url,
    title: b.title,
    description: b.description ?? "",
    note: b.note ?? null,
    summary: b.summary ?? null,
    tags: Array.isArray(b.tags) ? b.tags : [],
    content: b.content ?? null,
    assets: b.assets ?? null,
    logoData: b.logoData ?? null,
    registryLinks: b.registryLinks ?? null,
    ogImage: b.ogImage ?? null,
    ogTitle: b.ogTitle ?? null,
    ogDescription: b.ogDescription ?? null,
    ogUrl: b.ogUrl ?? null,
    ogImageExternal: b.ogImageExternal ?? null,
    ogImageLastFetchedAt: b.ogImageLastFetchedAt ?? null,
    ogImageEtag: b.ogImageEtag ?? null,
    readingTime: b.readingTime ?? null,
    wordCount: b.wordCount ?? null,
    archived: b.archived ?? false,
    isPrivate: b.isPrivate ?? false,
    isFavorite: b.isFavorite ?? false,
    taggingStatus: b.taggingStatus ?? null,
    domain: b.domain ?? null,
    dateBookmarked: b.dateBookmarked,
    datePublished: b.datePublished ?? null,
    dateCreated: b.dateCreated ?? null,
    dateUpdated: b.dateUpdated ?? null,
    modifiedAt: b.modifiedAt ?? null,
    sourceUpdatedAt: b.sourceUpdatedAt,
  }));

  await upsertBookmarks(inserts);
  console.log(`Successfully migrated ${inserts.length} bookmarks to PostgreSQL`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

**Step 2: Run migration**

```bash
DATABASE_URL="postgres://...@167.234.219.57:5438/postgres?sslmode=require" bun run scripts/migrate-s3-to-postgres.ts
```

**Step 3: Verify data**

```bash
psql "postgres://...@167.234.219.57:5438/postgres?sslmode=require" \
  -c "SELECT count(*) FROM bookmarks;" \
  -c "SELECT id, slug, title, search_vector IS NOT NULL AS has_fts FROM bookmarks LIMIT 5;"
```

**Step 4: Commit**

```bash
git add scripts/migrate-s3-to-postgres.ts
git commit -m "feat(db): add S3-to-PostgreSQL bookmark migration script"
```

---

## Task 8: Wire Data Access Layer to Drizzle

**Files:**

- Modify: `src/lib/bookmarks/bookmarks-data-access.server.ts`
- Modify: `src/lib/bookmarks/bookmarks-s3-store.ts` (keep as fallback, import conditionally)

**Context:** This is the most impactful edit. Replace S3 reads with Drizzle queries in the data access layer. Keep Next.js `"use cache"` directives intact. Keep the same exported function signatures so no downstream changes are needed.

**Approach:** Replace the internals of `fetchAndCacheBookmarks()`, `getBookmarksPageDirect()`, `getBookmarkById()`, `getBookmarksByTag()` to read from PostgreSQL instead of S3. The exported types and function signatures remain identical.

**Step 1: Edit `bookmarks-data-access.server.ts`**

Replace S3 imports and internal calls:

- `readBookmarksDatasetFromS3()` -> `getAllBookmarks()` from `@/lib/db/queries/bookmarks`
- `readBookmarksPageFromS3(page)` -> `getBookmarksPage(page, BOOKMARKS_PER_PAGE)`
- `readBookmarkByIdFromS3(id)` -> `getBookmarkById(id)`

Key constraint: the functions must still return `UnifiedBookmark[]` — so `BookmarkRow` needs a mapper function to `UnifiedBookmark`. Create a small mapper in `src/lib/db/queries/bookmarks.ts`:

```typescript
export function toUnifiedBookmark(row: BookmarkRow): UnifiedBookmark {
  return {
    id: row.id,
    slug: row.slug,
    url: row.url,
    title: row.title,
    // ... map all fields
  };
}
```

**Step 2: Run existing bookmark tests**

```bash
bun run test --grep bookmark
```

Expected: existing tests pass (they mock the data access layer)

**Step 3: Run full validate**

```bash
bun run validate
```

**Step 4: Commit**

```bash
git add src/lib/bookmarks/bookmarks-data-access.server.ts src/lib/db/queries/bookmarks.ts
git commit -m "feat(db): wire bookmark data access to Drizzle (reads)"
```

---

## Task 9: Wire Persistence Layer to Drizzle

**Files:**

- Modify: `src/lib/bookmarks/persistence.server.ts`

**Context:** Replace `writeJsonS3()` calls with `upsertBookmarks()`. Remove local filesystem cache writes (no longer needed with a real DB). Keep S3 writes for backward compatibility during transition (can be removed later).

**Step 1: Edit persistence to use Drizzle for writes**

Replace `writeBookmarkMasterFiles()` internals:

- `writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarks)` -> `upsertBookmarks(mapped)`
- Remove `writeBookmarksByIdFiles()` (individual JSON files no longer needed)
- Remove `writeLocalBookmarksCache()` calls
- Keep `writePaginatedBookmarks()` temporarily for S3 backward compat (mark deprecated)

**Step 2: Run tests, validate**

```bash
bun run test --grep bookmark
bun run validate
```

**Step 3: Commit**

```bash
git add src/lib/bookmarks/persistence.server.ts
git commit -m "feat(db): wire bookmark persistence to Drizzle (writes)"
```

---

## Task 10: GitHub Activity Schema & Migration

**Files:**

- Create: `src/lib/db/schema/github-activity.ts`
- Modify: `src/lib/db/schema/index.ts`
- Create: `src/lib/db/queries/github-activity.ts`
- Create: `src/lib/db/mutations/github-activity.ts`
- Create: `scripts/migrate-github-s3-to-postgres.ts`

**Context:** GitHub activity data is stored in S3 as JSON segments. The Drizzle table stores the structured data. Zod schemas in `src/types/schemas/github-storage.ts` define the shapes.

**Approach:** Same pattern as bookmarks: define Drizzle table, create queries/mutations, migrate data, wire data access layer.

**Step 1:** Define schema following the `GitHubActivityApiResponseFromSchema` shape.

**Step 2-5:** Create queries, mutations, migration script, wire `src/lib/data-access/github-storage.ts`.

**Step 6: Commit**

```bash
git add src/lib/db/schema/github-activity.ts src/lib/db/queries/github-activity.ts \
  src/lib/db/mutations/github-activity.ts scripts/migrate-github-s3-to-postgres.ts \
  src/lib/data-access/github-storage.ts src/lib/db/schema/index.ts
git commit -m "feat(db): add GitHub activity PostgreSQL schema and data access"
```

---

## Task 11: Hybrid Search Query

**Files:**

- Create: `src/lib/db/queries/hybrid-search.ts`

**Context:** This is the 3-layer search query combining FTS + trigram + vector similarity, matching the aVenture pattern.

**Step 1: Create hybrid search module**

```typescript
// src/lib/db/queries/hybrid-search.ts
import { db } from "@/lib/db/connection";
import { bookmarks, type BookmarkRow } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

interface HybridSearchOptions {
  query: string;
  embedding?: number[]; // 1024-dim from Qwen3-4B
  limit?: number;
}

export async function hybridSearch(options: HybridSearchOptions): Promise<BookmarkRow[]> {
  const { query, embedding, limit = 20 } = options;

  if (embedding) {
    // Full hybrid: FTS + trigram + vector
    return db.execute(sql`
      WITH keyword_results AS (
        SELECT id,
          ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) AS fts_score,
          similarity(title, ${query}) AS trgm_score
        FROM bookmarks
        WHERE search_vector @@ websearch_to_tsquery('english', ${query})
           OR title % ${query}
        LIMIT 50
      ),
      semantic_results AS (
        SELECT id,
          1.0 - (embedding <=> ${sql.raw(`'[${embedding.join(",")}]'::halfvec(1024)`)}) AS vec_score
        FROM bookmarks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${sql.raw(`'[${embedding.join(",")}]'::halfvec(1024)`)}
        LIMIT 50
      ),
      combined AS (
        SELECT
          COALESCE(k.id, s.id) AS id,
          COALESCE(k.fts_score, 0) * 2.0
            + COALESCE(k.trgm_score, 0) * 0.5
            + COALESCE(s.vec_score, 0) * 10.0 AS score
        FROM keyword_results k
        FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT b.*
      FROM combined c
      JOIN bookmarks b ON b.id = c.id
      ORDER BY c.score DESC
      LIMIT ${limit}
    `);
  }

  // Keyword-only fallback (no embedding provided)
  return searchBookmarksFTS(query);
}
```

**Step 2: Write test, run, verify**

**Step 3: Commit**

```bash
git add src/lib/db/queries/hybrid-search.ts
git commit -m "feat(db): add 3-layer hybrid search (FTS + trigram + vector)"
```

---

## Task 12: Generate Migration SQL

**Context:** After all schemas are stable and tested with `push`, generate proper migration files for reproducible deployments.

**Step 1: Generate migrations**

```bash
DATABASE_URL="..." bun drizzle-kit generate
```

**Step 2: Review generated SQL in `drizzle/` directory**

Check for:

- Quoting bugs on parameterized types (known drizzle-kit issue with `halfvec(1024)`)
- Correct `GENERATED ALWAYS AS` expressions
- Proper index creation

**Step 3: Apply migrations**

```bash
DATABASE_URL="..." bun drizzle-kit migrate
```

**Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat(db): add generated Drizzle migration SQL"
```

---

## Task 13: Cleanup & Final Validation

**Files:**

- Modify: `.env-example` (add `DATABASE_URL`)
- Review: all `src/lib/s3/` imports — remove unused S3 JSON read/write imports
- Review: file line counts (`bun run check:file-size`)

**Step 1: Add DATABASE_URL to .env-example**

```
DATABASE_URL=postgres://user:password@host:5438/postgres?sslmode=require
```

**Step 2: Run full validation suite**

```bash
bun run validate
bun run type-check
bun run test
bun run build
```

**Step 3: Verify deployed behavior**

```bash
bun run deploy:verify
```

**Step 4: Final commit**

```bash
git add .env-example
git commit -m "docs: add DATABASE_URL to .env-example"
```

---

## Verification Checklist

- [ ] `bun run validate` passes with 0 errors, 0 warnings [VR1c]
- [ ] `bun run type-check` passes [VR1d]
- [ ] `bun run test` passes [VR1b]
- [ ] `bun run build` succeeds [VR1a]
- [ ] `bun run check:file-size` — no new files > 350 lines [LC1a]
- [ ] All bookmark CRUD operations work via PostgreSQL
- [ ] FTS search returns ranked results
- [ ] Trigram fuzzy matching works on titles/slugs
- [ ] Embedding column accepts halfvec(1024) data
- [ ] No remaining S3 JSON reads for migrated entities (grep for removed imports)
- [ ] `pg_stat_statements` shows queries executing correctly

---

## Out of Scope (Future Tasks)

- [ ] Embedding generation pipeline (Qwen3-4B inference server integration)
- [ ] Full hybrid search API endpoint (depends on embedding pipeline)
- [ ] OG image / logo data migration (stays on S3 — binary assets)
- [ ] Blog post migration (stays as MDX files — content, not data)
- [ ] Chroma/MiniSearch/Fuse.js removal (after hybrid search is proven)
- [ ] S3 JSON code removal (after migration is stable and verified)
- [ ] Books data migration
- [ ] OpenGraph cache migration
