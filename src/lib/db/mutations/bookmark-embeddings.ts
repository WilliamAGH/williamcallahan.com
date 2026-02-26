import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { db } from "@/lib/db/connection";
import { BOOKMARK_EMBEDDING_DIMENSIONS, bookmarks } from "@/lib/db/schema/bookmarks";

const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;
const MAX_EMBEDDING_INPUT_CHARS = 8_000;

type BookmarkEmbeddingRow = {
  id: string;
  url: string;
  title: string;
  description: string;
  summary: string | null;
  note: string | null;
  domain: string | null;
  tags: unknown;
};

export type BookmarkEmbeddingBackfillOptions = {
  batchSize?: number;
  maxRows?: number;
  bookmarkIds?: string[];
  dryRun?: boolean;
};

export type BookmarkEmbeddingBackfillResult = {
  processedRows: number;
  updatedRows: number;
  remainingRows: number;
  usedModel: string;
  dryRun: boolean;
};

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

function buildBookmarkEmbeddingInput(row: BookmarkEmbeddingRow): string {
  const sections: string[] = [];

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

  sections.push(`URL: ${row.url}`);
  return sections.join("\n").slice(0, MAX_EMBEDDING_INPUT_CHARS);
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
      tags: bookmarks.tags,
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

  let processedRows = 0;
  let updatedRows = 0;

  while (maxRows === undefined || processedRows < maxRows) {
    const remainingBudget =
      maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processedRows);
    if (remainingBudget <= 0) {
      break;
    }

    const rows = await readMissingEmbeddingRows(remainingBudget, bookmarkIds);
    if (rows.length === 0) {
      break;
    }

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

    processedRows += rows.length;
    if (dryRun) {
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
