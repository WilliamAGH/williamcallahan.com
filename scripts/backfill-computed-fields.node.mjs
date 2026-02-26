#!/usr/bin/env node

/**
 * Backfill computed fields (word_count, reading_time) for bookmarks in PostgreSQL.
 *
 * Derives word_count from scraped_content_text (whitespace split) and
 * reading_time from word_count / 200 WPM.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-computed-fields.node.mjs
 *
 * Flags:
 *   --dry-run       Print what would be updated without writing
 *   --force         Overwrite existing values (default: skip non-null)
 *   --ids id1,id2   Only backfill specific bookmark IDs
 */

import postgres from "postgres";

const PRODUCTION_ENVIRONMENT = "production";
const READING_SPEED_WPM = 200;

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function resolveWriteEnvironment() {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.trim();
  if (deploymentEnv) {
    const normalized =
      deploymentEnv.toLowerCase() === "prod" ? PRODUCTION_ENVIRONMENT : deploymentEnv.toLowerCase();
    return { environment: normalized, source: "DEPLOYMENT_ENV" };
  }
  const nodeEnv = process.env.NODE_ENV?.trim();
  if (nodeEnv) {
    return { environment: nodeEnv.toLowerCase(), source: "NODE_ENV" };
  }
  return { environment: "unknown", source: "environment-default" };
}

function assertDatabaseWriteAllowed(operation) {
  const { environment, source } = resolveWriteEnvironment();
  if (environment === PRODUCTION_ENVIRONMENT) return;
  throw new Error(
    `[db/write-guard] Blocked "${operation}" because ${source} resolved to "${environment}". ` +
      "Only production runtime may write to PostgreSQL.",
  );
}

function computeWordCount(text) {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return text.trim().split(/\s+/).length;
}

function computeReadingTime(wordCount) {
  if (wordCount === null || wordCount === 0) return null;
  return Math.ceil(wordCount / READING_SPEED_WPM);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const idsIndex = args.indexOf("--ids");
const TARGET_IDS =
  idsIndex !== -1 && args[idsIndex + 1]
    ? args[idsIndex + 1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : null;

async function main() {
  if (!DRY_RUN) {
    assertDatabaseWriteAllowed("backfill-computed-fields");
  }

  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const sql = postgres(databaseUrl);

  console.log("=== Backfill word_count + reading_time ===");
  console.log(`  Mode:    ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`  Force:   ${FORCE ? "yes (overwrite existing)" : "no (skip non-null)"}`);
  console.log(`  Targets: ${TARGET_IDS ? TARGET_IDS.join(", ") : "all bookmarks"}`);
  console.log();

  try {
    const rows = TARGET_IDS
      ? await sql`
          SELECT id, scraped_content_text, word_count, reading_time
          FROM bookmarks
          WHERE id = ANY(${sql.array(TARGET_IDS, "text")})
          ORDER BY id ASC
        `
      : FORCE
        ? await sql`
            SELECT id, scraped_content_text, word_count, reading_time
            FROM bookmarks
            ORDER BY id ASC
          `
        : await sql`
            SELECT id, scraped_content_text, word_count, reading_time
            FROM bookmarks
            WHERE word_count IS NULL OR reading_time IS NULL
            ORDER BY id ASC
          `;

    console.log(`[db] ${rows.length} rows to process`);

    let updated = 0;
    let skippedNoContent = 0;
    let skippedUnchanged = 0;

    for (const row of rows) {
      const wordCount = computeWordCount(row.scraped_content_text);
      const readingTime = computeReadingTime(wordCount);

      if (wordCount === null) {
        skippedNoContent++;
        continue;
      }

      if (!FORCE && row.word_count === wordCount && row.reading_time === readingTime) {
        skippedUnchanged++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[dry-run] ${row.id}: word_count=${wordCount}, reading_time=${readingTime}`);
        updated++;
        continue;
      }

      await sql`
        UPDATE bookmarks
        SET word_count = ${wordCount}, reading_time = ${readingTime}
        WHERE id = ${row.id}
      `;
      updated++;
    }

    console.log();
    console.log("=== Results ===");
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}:       ${updated}`);
    console.log(`  Skipped (no content):    ${skippedNoContent}`);
    console.log(`  Skipped (unchanged):     ${skippedUnchanged}`);
    console.log(`  Total processed:         ${rows.length}`);

    if (!DRY_RUN && updated > 0) {
      const stats = await sql`
        SELECT
          count(*) FILTER (WHERE word_count IS NOT NULL) as with_wc,
          count(*) FILTER (WHERE reading_time IS NOT NULL) as with_rt,
          avg(word_count)::int as avg_wc,
          avg(reading_time)::int as avg_rt,
          count(*) as total
        FROM bookmarks
      `;
      const s = stats[0];
      console.log();
      console.log("=== Post-backfill state ===");
      console.log(`  word_count:    ${s.with_wc}/${s.total} populated (avg ${s.avg_wc} words)`);
      console.log(`  reading_time:  ${s.with_rt}/${s.total} populated (avg ${s.avg_rt} min)`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
