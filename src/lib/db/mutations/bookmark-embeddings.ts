import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { BOOKMARK_EMBEDDING_DIMENSIONS, bookmarks } from "@/lib/db/schema/bookmarks";
import { bookmarkContentSchema } from "@/types/schemas/bookmark";
import type {
  BookmarkEmbeddingRow,
  BookmarkEmbeddingBackfillOptions,
  BookmarkEmbeddingBackfillResult,
} from "@/types/db/bookmarks";

const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;

function resolveBatchSize(input?: number): number {
  if (input === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  if (!Number.isInteger(input) || input <= 0) {
    throw new Error(`batchSize must be a positive integer. Received: ${input}`);
  }
  if (input > MAX_BATCH_SIZE) {
    throw new Error(`batchSize must be <= ${MAX_BATCH_SIZE}. Received: ${input}`);
  }
  return input;
}

function resolveMaxRows(input?: number): number | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!Number.isInteger(input) || input <= 0) {
    throw new Error(`maxRows must be a positive integer. Received: ${input}`);
  }
  return input;
}

function parseTagName(tagValue: unknown): string | null {
  if (typeof tagValue === "string") {
    const normalized = tagValue.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (tagValue && typeof tagValue === "object" && "name" in tagValue) {
    const rawName = tagValue.name;
    if (typeof rawName === "string") {
      const normalized = rawName.trim();
      return normalized.length > 0 ? normalized : null;
    }
  }

  return null;
}

function collectTagNames(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const tagNames: string[] = [];
  for (const tag of rawTags) {
    const parsedName = parseTagName(tag);
    if (parsedName) {
      tagNames.push(parsedName);
    }
  }
  return tagNames;
}

/**
 * Build the text sent to the embedding model for a single bookmark.
 *
 * Layout: short structured metadata first, scraped content last.
 * The embedding server (llama.cpp) auto-truncates at its configured context
 * window (8 192 tokens for Qwen3-Embedding-4B).  Because scraped content is
 * placed last, truncation clips only the tail of long page text while all
 * structured metadata is always preserved.
 */
function buildBookmarkEmbeddingInput(row: BookmarkEmbeddingRow): string {
  const sections: string[] = [];
  const parsedContent = bookmarkContentSchema.safeParse(row.content);
  const content = parsedContent.success ? parsedContent.data : null;

  // --- structured metadata (always fits within 8 192 tokens) ---
  sections.push(`Title: ${row.title}`);
  sections.push(`Description: ${row.description}`);

  if (typeof row.summary === "string" && row.summary.trim().length > 0) {
    sections.push(`Summary: ${row.summary.trim()}`);
  }
  if (typeof row.note === "string" && row.note.trim().length > 0) {
    sections.push(`Note: ${row.note.trim()}`);
  }
  if (typeof row.domain === "string" && row.domain.trim().length > 0) {
    sections.push(`Domain: ${row.domain.trim()}`);
  }

  const tagNames = collectTagNames(row.tags);
  if (tagNames.length > 0) {
    sections.push(`Tags: ${tagNames.join(", ")}`);
  }

  if (content) {
    if (
      content.title &&
      content.title.trim().length > 0 &&
      content.title.trim() !== row.title.trim()
    ) {
      sections.push(`Content Title: ${content.title.trim()}`);
    }
    if (
      content.description &&
      content.description.trim().length > 0 &&
      content.description.trim() !== row.description.trim()
    ) {
      sections.push(`Content Description: ${content.description.trim()}`);
    }
    if (content.author && content.author.trim().length > 0) {
      sections.push(`Author: ${content.author.trim()}`);
    }
    if (content.publisher && content.publisher.trim().length > 0) {
      sections.push(`Publisher: ${content.publisher.trim()}`);
    }
    if (content.crawlStatus && content.crawlStatus.trim().length > 0) {
      sections.push(`Crawl Status: ${content.crawlStatus.trim()}`);
    }
    if (content.contentAssetId && content.contentAssetId.trim().length > 0) {
      sections.push(`Content Asset ID: ${content.contentAssetId.trim()}`);
    }
    if (content.crawledAt && content.crawledAt.trim().length > 0) {
      sections.push(`Crawled At: ${content.crawledAt.trim()}`);
    }
    if (content.datePublished && content.datePublished.trim().length > 0) {
      sections.push(`Published: ${content.datePublished.trim()}`);
    }
    if (content.dateModified && content.dateModified.trim().length > 0) {
      sections.push(`Updated: ${content.dateModified.trim()}`);
    }
  }

  sections.push(`URL: ${row.url}`);

  // --- scraped content last: server truncation clips only its tail ---
  if (typeof row.scrapedContentText === "string" && row.scrapedContentText.trim().length > 0) {
    sections.push(`Scraped Content: ${row.scrapedContentText.trim()}`);
  }

  return sections.join("\n");
}

function buildHalfvecLiteral(embedding: number[]): string {
  if (embedding.length !== BOOKMARK_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${BOOKMARK_EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
    );
  }

  const serializedValues = embedding.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Embedding contains non-finite value at index ${index}.`);
    }
    return Number(value).toString();
  });
  return `'[${serializedValues.join(",")}]'::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})`;
}

function normalizeBookmarkIds(bookmarkIds?: string[]): string[] | undefined {
  if (!bookmarkIds) {
    return undefined;
  }

  const unique = new Set<string>();
  for (const value of bookmarkIds) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }
  return unique.size > 0 ? [...unique] : [];
}

function buildMissingEmbeddingWhereClause(bookmarkIds?: string[]) {
  const nullEmbeddingCondition = isNull(bookmarks.qwen4bFp16Embedding);
  if (!bookmarkIds) {
    return nullEmbeddingCondition;
  }
  if (bookmarkIds.length === 0) {
    return sql`false`;
  }
  return and(nullEmbeddingCondition, inArray(bookmarks.id, bookmarkIds)) ?? nullEmbeddingCondition;
}

async function readMissingEmbeddingRows(
  limit: number,
  bookmarkIds?: string[],
): Promise<BookmarkEmbeddingRow[]> {
  const rows = await db
    .select({
      id: bookmarks.id,
      url: bookmarks.url,
      title: bookmarks.title,
      description: bookmarks.description,
      summary: bookmarks.summary,
      note: bookmarks.note,
      domain: bookmarks.domain,
      scrapedContentText: bookmarks.scrapedContentText,
      tags: bookmarks.tags,
      content: bookmarks.content,
    })
    .from(bookmarks)
    .where(buildMissingEmbeddingWhereClause(bookmarkIds))
    .orderBy(asc(bookmarks.id))
    .limit(limit);

  return rows;
}

async function countMissingEmbeddings(bookmarkIds?: string[]): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookmarks)
    .where(buildMissingEmbeddingWhereClause(bookmarkIds));

  return rows[0]?.count ?? 0;
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
    if (remainingBudget <= 0) {
      break;
    }

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

      await db
        .update(bookmarks)
        .set({ qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)) })
        .where(eq(bookmarks.id, row.id));
      updatedRows += 1;
    }
  }

  const remainingRows = await countMissingEmbeddings(bookmarkIds);
  return {
    processedRows,
    updatedRows,
    remainingRows,
    usedModel: config.model,
    dryRun,
  };
}
