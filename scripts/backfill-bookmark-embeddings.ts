#!/usr/bin/env bun

import { backfillBookmarkEmbeddings } from "@/lib/db/mutations/bookmark-embeddings";
import { closeDatabaseConnection } from "@/lib/db/connection";

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function parsePositiveInteger(value: string | undefined, label: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseBookmarkIds(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const batchSize = parsePositiveInteger(readFlagValue(args, "--batch-size"), "batch-size");
  const maxRows = parsePositiveInteger(readFlagValue(args, "--max-rows"), "max-rows");
  const bookmarkIds = parseBookmarkIds(readFlagValue(args, "--bookmark-ids"));
  const dryRun = hasFlag(args, "--dry-run");

  console.log(
    `[backfill-bookmark-embeddings] Starting (dryRun=${dryRun}, batchSize=${batchSize ?? "default"}, maxRows=${maxRows ?? "all"})`,
  );
  if (bookmarkIds && bookmarkIds.length > 0) {
    console.log(`[backfill-bookmark-embeddings] Restricting to ${bookmarkIds.length} bookmark IDs`);
  }

  const result = await backfillBookmarkEmbeddings({
    batchSize,
    maxRows,
    bookmarkIds,
    dryRun,
  });

  console.table({
    processedRows: result.processedRows,
    updatedRows: result.updatedRows,
    remainingRows: result.remainingRows,
    dryRun: result.dryRun,
    model: result.usedModel,
  });
}

try {
  await run();
} finally {
  await closeDatabaseConnection();
}
