#!/usr/bin/env node
/**
 * Backfill Qwen3-Embedding-4B embeddings for bookmarks into the unified
 * `embeddings` table.
 *
 * This script runs under Node.js; `tsx` registers the repository TypeScript
 * resolver only for the canonical database mutation import. The batching,
 * embedding-text contract, and `embedding_failures` checkpointing all stay in
 * `src/lib/db/mutations/bookmark-embeddings.ts` — the same function the
 * production bookmark refresh path calls — and are not restated here.
 *
 * IMPORTANT: Node.js only, never bun. Bun's TLS fails SSL negotiation with
 * PostgreSQL. See CLAUDE.md [RT1].
 *
 * Usage (NEXT_PUBLIC_SITE_URL must be unset: the write guard in
 * `src/lib/db/connection.ts` resolves a site URL ahead of DEPLOYMENT_ENV, and a
 * localhost value there resolves to "development" and blocks the write):
 *   set -a; source .env; set +a
 *   unset NEXT_PUBLIC_SITE_URL
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-bookmark-embeddings.node.mjs
 *
 * Flags:
 *   --dry-run        Embed without writing (requires --max-rows; unwritten rows requeue)
 *   --batch-size N   Rows per embedding request (default 16, max 128)
 *   --max-rows N     Stop after N rows
 */

const PREFIX = "[backfill-bookmark-embeddings]";

function readFlagValue(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function parsePositiveInteger(flag) {
  const value = readFlagValue(flag);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

async function runBackfill(options) {
  const { register } = await import("tsx/esm/api");
  const unregister = register({ tsconfig: "./tsconfig.json" });
  let closeDatabaseConnection;

  try {
    const database = await import("../src/lib/db/connection.ts");
    closeDatabaseConnection = database.closeDatabaseConnection;
    const { backfillBookmarkEmbeddings } =
      await import("../src/lib/db/mutations/bookmark-embeddings.ts");
    return await backfillBookmarkEmbeddings(options);
  } finally {
    try {
      if (closeDatabaseConnection !== undefined) await closeDatabaseConnection();
    } finally {
      await unregister();
    }
  }
}

const dryRun = process.argv.slice(2).includes("--dry-run");
const maxRows = parsePositiveInteger("--max-rows");
if (dryRun && maxRows === undefined) {
  throw new Error(
    "--dry-run requires --max-rows: rows are never written, so the backfill loop would reselect them forever.",
  );
}

const result = await runBackfill({
  dryRun,
  retryTransientFailures: true,
  batchSize: parsePositiveInteger("--batch-size"),
  maxRows,
});

console.table(result);
if (result.remainingRows > 0) {
  console.error(`${PREFIX} ${result.remainingRows} bookmarks still have no embedding.`);
  process.exit(1);
}
