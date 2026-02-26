#!/usr/bin/env node
/**
 * Migrate existing embeddings from domain tables into unified embeddings.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). Bun's TLS
 * implementation fails SSL negotiation with PostgreSQL. See CLAUDE.md [RT1].
 *
 * Copies halfvec columns directly — no re-embedding needed. Idempotent via
 * ON CONFLICT (domain, entity_id) DO UPDATE.
 *
 * Sources:
 *   bookmarks            → domain='bookmark',  entity_id=id
 *   thoughts             → domain='thought',   entity_id=id
 *   ai_analysis_latest   → domain='ai_analysis', entity_id=domain||':'||entity_id
 *   opengraph_metadata   → domain='opengraph', entity_id=url_hash
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/migrate-embeddings-to-unified.node.mjs
 *
 * Flags:
 *   --dry-run   Show counts without writing
 */

import postgres from "postgres";

const P = "[embed-migrate]";
const PRODUCTION = "production";

function readEnv(n) {
  const v = process.env[n]?.trim();
  if (!v) throw new Error(`${n} is required.`);
  return v;
}
function hasFlag(f) {
  return process.argv.slice(2).includes(f);
}
function assertProdWrite(op) {
  const raw = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  const env = raw === "prod" ? PRODUCTION : raw;
  if (env !== PRODUCTION) throw new Error(`[write-guard] Blocked "${op}": env="${env}".`);
}

async function migrateBookmarks(sql, dryRun) {
  const rows =
    await sql`SELECT count(*) AS cnt FROM bookmarks WHERE qwen_4b_fp16_embedding IS NOT NULL`;
  const count = Number(rows[0].cnt);
  console.log(`${P} bookmarks: ${count} rows with embeddings`);
  if (dryRun || count === 0) return count;

  await sql`
    INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
    SELECT 'bookmark', id, title, date_bookmarked, qwen_4b_fp16_embedding,
           extract(epoch from now())::bigint * 1000
    FROM bookmarks
    WHERE qwen_4b_fp16_embedding IS NOT NULL
    ON CONFLICT (domain, entity_id) DO UPDATE
    SET qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding,
        title = EXCLUDED.title,
        content_date = EXCLUDED.content_date,
        updated_at = EXCLUDED.updated_at
  `;
  console.log(`${P} bookmarks: migrated ${count} embeddings`);
  return count;
}

async function migrateThoughts(sql, dryRun) {
  const rows =
    await sql`SELECT count(*) AS cnt FROM thoughts WHERE qwen_4b_fp16_embedding IS NOT NULL`;
  const count = Number(rows[0].cnt);
  console.log(`${P} thoughts: ${count} rows with embeddings`);
  if (dryRun || count === 0) return count;

  await sql`
    INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
    SELECT 'thought', id::text, title,
           to_char(to_timestamp(created_at / 1000.0), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           qwen_4b_fp16_embedding,
           extract(epoch from now())::bigint * 1000
    FROM thoughts
    WHERE qwen_4b_fp16_embedding IS NOT NULL
    ON CONFLICT (domain, entity_id) DO UPDATE
    SET qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding,
        title = EXCLUDED.title,
        content_date = EXCLUDED.content_date,
        updated_at = EXCLUDED.updated_at
  `;
  console.log(`${P} thoughts: migrated ${count} embeddings`);
  return count;
}

async function migrateAiAnalysis(sql, dryRun) {
  const rows =
    await sql`SELECT count(*) AS cnt FROM ai_analysis_latest WHERE qwen_4b_fp16_embedding IS NOT NULL`;
  const count = Number(rows[0].cnt);
  console.log(`${P} ai_analysis: ${count} rows with embeddings`);
  if (dryRun || count === 0) return count;

  await sql`
    INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
    SELECT 'ai_analysis', domain || ':' || entity_id,
           coalesce(entity_id, 'unknown'),
           generated_at,
           qwen_4b_fp16_embedding,
           extract(epoch from now())::bigint * 1000
    FROM ai_analysis_latest
    WHERE qwen_4b_fp16_embedding IS NOT NULL
    ON CONFLICT (domain, entity_id) DO UPDATE
    SET qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding,
        title = EXCLUDED.title,
        content_date = EXCLUDED.content_date,
        updated_at = EXCLUDED.updated_at
  `;
  console.log(`${P} ai_analysis: migrated ${count} embeddings`);
  return count;
}

async function migrateOpengraph(sql, dryRun) {
  const rows =
    await sql`SELECT count(*) AS cnt FROM opengraph_metadata WHERE qwen_4b_fp16_embedding IS NOT NULL`;
  const count = Number(rows[0].cnt);
  console.log(`${P} opengraph: ${count} rows with embeddings`);
  if (dryRun || count === 0) return count;

  await sql`
    INSERT INTO embeddings (domain, entity_id, title, content_date, qwen_4b_fp16_embedding, updated_at)
    SELECT 'opengraph', url_hash,
           coalesce(url, 'unknown'),
           NULL,
           qwen_4b_fp16_embedding,
           extract(epoch from now())::bigint * 1000
    FROM opengraph_metadata
    WHERE qwen_4b_fp16_embedding IS NOT NULL
    ON CONFLICT (domain, entity_id) DO UPDATE
    SET qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding,
        title = EXCLUDED.title,
        updated_at = EXCLUDED.updated_at
  `;
  console.log(`${P} opengraph: migrated ${count} embeddings`);
  return count;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  if (!dryRun) assertProdWrite("migrate-embeddings-to-unified");

  const databaseUrl = readEnv("DATABASE_URL");
  const sql = postgres(databaseUrl, { ssl: "require", max: 4 });

  try {
    console.log(`${P} Starting embedding migration${dryRun ? " (dry run)" : ""}...`);

    const bookmarkCount = await migrateBookmarks(sql, dryRun);
    const thoughtCount = await migrateThoughts(sql, dryRun);
    const aiCount = await migrateAiAnalysis(sql, dryRun);
    const ogCount = await migrateOpengraph(sql, dryRun);

    const total = bookmarkCount + thoughtCount + aiCount + ogCount;
    console.log(`${P} Total: ${total} embeddings${dryRun ? " (would be migrated)" : " migrated"}`);

    if (!dryRun) {
      const verify =
        await sql`SELECT domain, count(*) AS cnt FROM embeddings GROUP BY domain ORDER BY domain`;
      console.log(`${P} Verification:`);
      for (const row of verify) {
        console.log(`  ${row.domain}: ${row.cnt}`);
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(`${P} Fatal:`, err);
  process.exit(1);
});
