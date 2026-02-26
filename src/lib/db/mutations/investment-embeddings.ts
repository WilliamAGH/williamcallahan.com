/**
 * Investment embedding backfill — generates embeddings and writes to embeddings.
 *
 * Uses canonical embedding input contract: INVESTMENT_EMBEDDING_FIELDS
 * from embedding-field-specs-entities.ts. Writes to embeddings with
 * domain = 'investment'.
 *
 * @module lib/db/mutations/investment-embeddings
 */

import { sql } from "drizzle-orm";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { buildEmbeddingText } from "@/lib/db/embedding-input-contracts";
import { INVESTMENT_EMBEDDING_FIELDS } from "@/lib/db/embedding-field-specs-entities";
import {
  embeddings as embeddingsTable,
  CONTENT_EMBEDDING_DIMENSIONS,
} from "@/lib/db/schema/content-embeddings";
import type {
  InvestmentEmbeddingRow,
  InvestmentEmbeddingBackfillOptions,
  InvestmentEmbeddingBackfillResult,
} from "@/types/db/investments";

const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;

function buildHalfvecLiteral(embedding: number[]): string {
  if (embedding.length !== CONTENT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${CONTENT_EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
    );
  }
  for (let idx = 0; idx < embedding.length; idx++) {
    if (!Number.isFinite(embedding[idx])) {
      throw new TypeError(`Embedding contains non-finite value at index ${idx}.`);
    }
  }
  const serialized = embedding.map((v) => Number(v).toString());
  return `'[${serialized.join(",")}]'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`;
}

function buildInvestmentEmbeddingInput(row: InvestmentEmbeddingRow): string {
  const source: Record<string, unknown> = {
    name: row.name,
    description: row.description,
    category: row.category,
    stage: row.stage,
    status: row.status,
    operating_status: row.operatingStatus,
    location: row.location,
    type: row.type,
    invested_year: row.investedYear,
    accelerator: row.accelerator,
  };
  return buildEmbeddingText(INVESTMENT_EMBEDDING_FIELDS, source);
}

async function readMissingEmbeddingRows(limit: number): Promise<InvestmentEmbeddingRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    description: string;
    category: string | null;
    stage: string;
    status: string;
    operating_status: string;
    location: string | null;
    type: string;
    invested_year: string;
    accelerator: unknown;
  }>(sql`
    SELECT i.id, i.name, i.description, i.category, i.stage, i.status,
           i.operating_status, i.location, i.type, i.invested_year, i.accelerator
    FROM investments i
    LEFT JOIN embeddings ce
      ON ce.domain = 'investment' AND ce.entity_id = i.id
    WHERE ce.entity_id IS NULL
    ORDER BY i.id ASC LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    stage: r.stage,
    status: r.status,
    operatingStatus: r.operating_status,
    location: r.location,
    type: r.type,
    investedYear: r.invested_year,
    accelerator: r.accelerator,
  }));
}

async function countMissingEmbeddings(): Promise<number> {
  const rows = await db.execute<{ cnt: number }>(sql`
    SELECT count(*)::int AS cnt
    FROM investments i
    LEFT JOIN embeddings ce
      ON ce.domain = 'investment' AND ce.entity_id = i.id
    WHERE ce.entity_id IS NULL
  `);
  return rows[0]?.cnt ?? 0;
}

export async function backfillInvestmentEmbeddings(
  options: InvestmentEmbeddingBackfillOptions = {},
): Promise<InvestmentEmbeddingBackfillResult> {
  const config = resolveDefaultEndpointCompatibleEmbeddingConfig();
  if (!config) {
    throw new Error("AI_DEFAULT_EMBEDDING_MODEL is not configured.");
  }

  const batchSize = Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxRows = options.maxRows;
  const dryRun = options.dryRun === true;

  if (!dryRun) {
    assertDatabaseWriteAllowed("backfillInvestmentEmbeddings");
  }

  let processedRows = 0;
  let updatedRows = 0;

  while (maxRows === undefined || processedRows < maxRows) {
    const budget = maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processedRows);
    if (budget <= 0) break;

    const rows = await readMissingEmbeddingRows(budget);
    if (rows.length === 0) break;

    const inputs = rows.map(buildInvestmentEmbeddingInput);
    const embeddings = await embedTextsWithEndpointCompatibleModel({ config, input: inputs });
    if (embeddings.length !== rows.length) {
      throw new Error(
        `Embedding count mismatch. Expected ${rows.length}, received ${embeddings.length}.`,
      );
    }

    processedRows += rows.length;
    if (dryRun) continue;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const embedding = embeddings[i];
      if (!row || !embedding) throw new Error(`Missing payload for index ${i}.`);

      const embeddingText = buildInvestmentEmbeddingInput(row);
      await db
        .insert(embeddingsTable)
        .values({
          domain: "investment",
          entityId: row.id,
          title: row.name,
          embeddingText,
          contentDate: null,
          qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [embeddingsTable.domain, embeddingsTable.entityId],
          set: {
            title: row.name,
            embeddingText,
            qwen4bFp16Embedding: sql.raw(buildHalfvecLiteral(embedding)),
            updatedAt: Date.now(),
          },
        });
      updatedRows += 1;
    }
  }

  const remainingRows = await countMissingEmbeddings();
  return { processedRows, updatedRows, remainingRows, usedModel: config.model, dryRun };
}
