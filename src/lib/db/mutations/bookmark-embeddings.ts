import { sql } from "drizzle-orm";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { buildEmbeddingText } from "@/lib/db/embedding-input-contracts";
import { BOOKMARK_EMBEDDING_FIELDS } from "@/lib/db/embedding-field-specs";
import {
  contentEmbeddings,
  CONTENT_EMBEDDING_DIMENSIONS,
} from "@/lib/db/schema/content-embeddings";
import { bookmarkContentSchema } from "@/types/schemas/bookmark";
import type {
  BookmarkEmbeddingRow,
  BookmarkEmbeddingBackfillOptions,
  BookmarkEmbeddingBackfillResult,
} from "@/types/db/bookmarks";

const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;

function resolveBatchSize(input?: number): number {
  if (input === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(input) || input <= 0) {
    throw new Error(`batchSize must be a positive integer. Received: ${input}`);
  }
  if (input > MAX_BATCH_SIZE) {
    throw new Error(`batchSize must be <= ${MAX_BATCH_SIZE}. Received: ${input}`);
  }
  return input;
}

function resolveMaxRows(input?: number): number | undefined {
  if (input === undefined) return undefined;
  if (!Number.isInteger(input) || input <= 0) {
    throw new Error(`maxRows must be a positive integer. Received: ${input}`);
  }
  return input;
}

/**
 * Build embedding input text for a bookmark using the canonical contract labels.
 *
 * Special handling: deduplicates crawled title/description when they match
 * the primary bookmark title/description (domain-specific optimization).
 */
function buildBookmarkEmbeddingInput(row: BookmarkEmbeddingRow): string {
  const parsedContent = bookmarkContentSchema.safeParse(row.content);
  const content = parsedContent.success ? parsedContent.data : null;

  const source: Record<string, unknown> = {
    title: row.title,
    description: row.description,
    summary: row.summary,
    note: row.note,
    domain: row.domain,
    tags: row.tags,
    url: row.url,
    scrapedContentText: row.scrapedContentText,
  };

  if (content) {
    const crawledTitle =
      content.title?.trim() && content.title.trim() !== row.title.trim()
        ? content.title.trim()
        : null;
    const crawledDesc =
      content.description?.trim() && content.description.trim() !== row.description.trim()
        ? content.description.trim()
        : null;

    source.content = {
      title: crawledTitle,
      description: crawledDesc,
      author: content.author ?? null,
      publisher: content.publisher ?? null,
    };
  }

  return buildEmbeddingText(BOOKMARK_EMBEDDING_FIELDS, source);
}

function buildHalfvecLiteral(embedding: number[]): string {
  if (embedding.length !== CONTENT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${CONTENT_EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
    );
  }
  const serialized = embedding.map((value, idx) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Embedding contains non-finite value at index ${idx}.`);
    }
    return Number(value).toString();
  });
  return `'[${serialized.join(",")}]'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`;
}

function normalizeBookmarkIds(bookmarkIds?: string[]): string[] | undefined {
  if (!bookmarkIds) return undefined;
  const unique = new Set<string>();
  for (const value of bookmarkIds) {
    const normalized = value.trim();
    if (normalized.length > 0) unique.add(normalized);
  }
  return unique.size > 0 ? [...unique] : [];
}

/**
 * Find bookmarks that don't yet have a row in content_embeddings.
 * Uses LEFT JOIN instead of checking a per-domain embedding column.
 */
async function readMissingEmbeddingRows(
  limit: number,
  bookmarkIds?: string[],
): Promise<BookmarkEmbeddingRow[]> {
  const joins = sql`
    SELECT b.id, b.url, b.title, b.description, b.summary, b.note,
           b.domain, b.scraped_content_text, b.tags, b.content
    FROM bookmarks b
    LEFT JOIN content_embeddings ce
      ON ce.domain = 'bookmark' AND ce.entity_id = b.id
    WHERE ce.entity_id IS NULL
  `;

  const idFilter =
    bookmarkIds && bookmarkIds.length > 0 ? sql` AND b.id = ANY(${bookmarkIds})` : sql``;

  const rows = await db.execute<{
    id: string;
    url: string;
    title: string;
    description: string;
    summary: string | null;
    note: string | null;
    domain: string | null;
    scraped_content_text: string | null;
    tags: unknown;
    content: unknown;
  }>(sql`${joins}${idFilter} ORDER BY b.id ASC LIMIT ${limit}`);

  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    description: r.description,
    summary: r.summary,
    note: r.note,
    domain: r.domain,
    scrapedContentText: r.scraped_content_text,
    tags: r.tags,
    content: r.content,
  }));
}

async function countMissingEmbeddings(bookmarkIds?: string[]): Promise<number> {
  const idFilter =
    bookmarkIds && bookmarkIds.length > 0 ? sql` AND b.id = ANY(${bookmarkIds})` : sql``;

  const rows = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM bookmarks b
    LEFT JOIN content_embeddings ce
      ON ce.domain = 'bookmark' AND ce.entity_id = b.id
    WHERE ce.entity_id IS NULL${idFilter}
  `);

  return rows[0]?.cnt ?? 0;
}

export async function backfillBookmarkEmbeddings(
  options: BookmarkEmbeddingBackfillOptions = {},
): Promise<BookmarkEmbeddingBackfillResult> {
  const config = resolveDefaultEndpointCompatibleEmbeddingConfig();
  if (!config) {
    throw new Error(
      "AI_DEFAULT_EMBEDDING_MODEL is not configured. Set it to enable bookmark embedding backfill.",
    );
  }

  const batchSize = resolveBatchSize(options.batchSize);
  const maxRows = resolveMaxRows(options.maxRows);
  const dryRun = options.dryRun === true;
  const bookmarkIds = normalizeBookmarkIds(options.bookmarkIds);

  if (!dryRun) {
    assertDatabaseWriteAllowed("backfillBookmarkEmbeddings");
  }

  let processedRows = 0;
  let updatedRows = 0;

  while (maxRows === undefined || processedRows < maxRows) {
    const remainingBudget =
      maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processedRows);
    if (remainingBudget <= 0) break;

    console.log(
      `[bookmark-embeddings] Selecting up to ${remainingBudget} rows (processed=${processedRows}).`,
    );
    const rows = await readMissingEmbeddingRows(remainingBudget, bookmarkIds);
    if (rows.length === 0) {
      console.log("[bookmark-embeddings] No remaining rows to backfill.");
      break;
    }

    console.log(`[bookmark-embeddings] Generating embeddings for ${rows.length} rows.`);
    const embeddingInput = rows.map((row) => buildBookmarkEmbeddingInput(row));
    const embeddings = await embedTextsWithEndpointCompatibleModel({
      config,
      input: embeddingInput,
    });
    if (embeddings.length !== rows.length) {
      throw new Error(
        `Embedding result count mismatch. Expected ${rows.length}, received ${embeddings.length}.`,
      );
    }
    console.log(
      `[bookmark-embeddings] Received ${embeddings.length} embeddings (dim=${embeddings[0]?.length ?? 0}).`,
    );

    processedRows += rows.length;
    if (dryRun) {
      console.log("[bookmark-embeddings] Dry run enabled; skipping database updates.");
      continue;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const embedding = embeddings[index];
      if (!row || !embedding) {
        throw new Error(`Missing backfill payload for row index ${index}.`);
      }

      const embeddingText = buildBookmarkEmbeddingInput(row);
      await db
        .insert(contentEmbeddings)
        .values({
          domain: "bookmark",
          entityId: row.id,
          title: row.title,
          embeddingText,
          contentDate: null,
          qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [contentEmbeddings.domain, contentEmbeddings.entityId],
          set: {
            title: row.title,
            embeddingText,
            qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
            updatedAt: Date.now(),
          },
        });
      updatedRows += 1;
    }
  }

  const remainingRows = await countMissingEmbeddings(bookmarkIds);
  return { processedRows, updatedRows, remainingRows, usedModel: config.model, dryRun };
}
