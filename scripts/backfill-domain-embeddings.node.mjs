#!/usr/bin/env node
/**
 * Backfill Qwen3-Embedding-4B embeddings for domain tables.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). Bun's TLS
 * implementation fails SSL negotiation with PostgreSQL. See CLAUDE.md [RT1].
 *
 * Handles: ai_analysis_latest, opengraph_metadata, thoughts
 * Follows the same pattern as backfill-bookmark-embeddings.node.mjs.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-domain-embeddings.node.mjs
 *
 * Flags:
 *   --dry-run          Show what would be written without writing
 *   --force            Regenerate ALL embeddings (not just missing)
 *   --domain X         Only backfill a specific domain
 *     Valid: ai-analysis, opengraph, thoughts
 *   --batch-size N     Texts per API call (default 16, max 128)
 *   --max-rows N       Stop after N rows
 */

import postgres from "postgres";

const EMBEDDING_DIMENSIONS = 2560;
const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;
const DEFAULT_TIMEOUT_MS = 120_000;
const P = "[domain-embeddings]";
const PRODUCTION = "production";

function readEnv(n) {
  const v = process.env[n]?.trim();
  if (!v) throw new Error(`${n} is required.`);
  return v;
}
function hasFlag(f) {
  return process.argv.slice(2).includes(f);
}
function flagVal(f) {
  const a = process.argv.slice(2);
  const i = a.indexOf(f);
  return i < 0 ? undefined : a[i + 1];
}
function parsePositiveInt(v, label) {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer.`);
  return n;
}
function assertProdWrite(op) {
  const raw = (process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  const env = raw === "prod" ? PRODUCTION : raw;
  if (env !== PRODUCTION) throw new Error(`[write-guard] Blocked "${op}": env="${env}".`);
}
function buildApiBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  url.pathname = basePath.endsWith("/v1") ? basePath : `${basePath}/v1`;
  return url.toString();
}

async function embedTexts(apiBaseUrl, apiKey, model, input, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${apiBaseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json?.data || !Array.isArray(json.data)) throw new Error("Invalid response: no data array");
  const embeddings = [...json.data].toSorted((a, b) => a.index - b.index).map((d) => d.embedding);
  if (embeddings.length !== input.length) {
    throw new Error(`Count mismatch: expected ${input.length}, got ${embeddings.length}`);
  }
  return embeddings;
}

function serializeHalfvec(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Dimensions must be ${EMBEDDING_DIMENSIONS}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`,
    );
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(Number(embedding[i]))) throw new TypeError(`Non-finite at index ${i}`);
  }
  return `[${embedding.join(",")}]`;
}

// ─── AI Analysis ─────────────────────────────────────────

function buildAiAnalysisText(row) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const sections = [];
  sections.push(`Domain: ${row.domain}`);
  sections.push(`Entity: ${row.entity_id}`);
  const analysis = payload.analysis ?? payload;
  if (typeof analysis.summary === "string" && analysis.summary.trim()) {
    sections.push(`Summary: ${analysis.summary.trim()}`);
  }
  if (typeof analysis.category === "string" && analysis.category.trim()) {
    sections.push(`Category: ${analysis.category.trim()}`);
  }
  if (typeof analysis.targetAudience === "string" && analysis.targetAudience.trim()) {
    sections.push(`Target Audience: ${analysis.targetAudience.trim()}`);
  }
  if (typeof analysis.idealReader === "string" && analysis.idealReader.trim()) {
    sections.push(`Ideal Reader: ${analysis.idealReader.trim()}`);
  }
  const highlights = analysis.highlights ?? analysis.keyHighlights;
  if (Array.isArray(highlights)) {
    const items = highlights.filter((h) => typeof h === "string" && h.trim()).map((h) => h.trim());
    if (items.length > 0) sections.push(`Highlights: ${items.join("; ")}`);
  }
  const themes = analysis.keyThemes ?? analysis.themes;
  if (Array.isArray(themes)) {
    const items = themes.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
    if (items.length > 0) sections.push(`Themes: ${items.join("; ")}`);
  }
  const topics = analysis.topics ?? analysis.keyTopics;
  if (Array.isArray(topics)) {
    const items = topics.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
    if (items.length > 0) sections.push(`Topics: ${items.join("; ")}`);
  }
  if (typeof analysis.contentType === "string" && analysis.contentType.trim()) {
    sections.push(`Content Type: ${analysis.contentType.trim()}`);
  }
  if (typeof analysis.technicalLevel === "string") {
    sections.push(`Technical Level: ${analysis.technicalLevel}`);
  }
  if (sections.length <= 2) return null;
  return sections.join("\n");
}

async function backfillAiAnalysis(
  sql,
  apiBaseUrl,
  apiKey,
  model,
  batchSize,
  maxRows,
  dry,
  force,
  timeoutMs,
) {
  const whereClause = force ? sql`` : sql`WHERE qwen_4b_fp16_embedding IS NULL`;
  const countResult = await sql`SELECT count(*)::int as c FROM ai_analysis_latest ${whereClause}`;
  const total = countResult[0].c;
  console.log(`${P} ai-analysis: ${total} rows to process`);
  if (total === 0) return;
  let processed = 0,
    updated = 0,
    skipped = 0;
  while (maxRows === undefined || processed < maxRows) {
    const limit = maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processed);
    if (limit <= 0) break;
    // OFFSET 0 for non-force: updated rows drop out of WHERE IS NULL, so result set shrinks naturally.
    // OFFSET processed for force: all rows remain in result set, need to page forward.
    const offset = force ? processed : 0;
    const rows = await sql`
      SELECT domain, entity_id, payload FROM ai_analysis_latest
      ${whereClause} ORDER BY domain, entity_id LIMIT ${limit} OFFSET ${offset}`;
    if (rows.length === 0) break;
    const texts = [];
    const validRows = [];
    for (const row of rows) {
      const text = buildAiAnalysisText(row);
      if (!text) {
        skipped++;
        continue;
      }
      texts.push(text);
      validRows.push(row);
    }
    if (texts.length === 0) {
      processed += rows.length;
      continue;
    }
    const embeddings = await embedTexts(apiBaseUrl, apiKey, model, texts, timeoutMs);
    processed += rows.length;
    if (dry) {
      console.log(`${P} ai-analysis: dry-run processed=${processed}/${total}`);
      continue;
    }
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      await sql`UPDATE ai_analysis_latest SET qwen_4b_fp16_embedding = ${serializeHalfvec(embeddings[i])}::halfvec(2560)
        WHERE domain = ${r.domain} AND entity_id = ${r.entity_id}`;
      updated++;
    }
    console.log(
      `${P} ai-analysis: processed=${processed}/${total} updated=${updated} skipped=${skipped}`,
    );
  }
  console.log(`${P} ai-analysis: DONE updated=${updated} skipped=${skipped}`);
}

// ─── OpenGraph Metadata ──────────────────────────────────

function buildOgText(row) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const sections = [];
  const title = payload.title ?? payload.ogTitle;
  if (typeof title === "string" && title.trim()) sections.push(`Title: ${title.trim()}`);
  const desc = payload.description ?? payload.ogDescription;
  if (typeof desc === "string" && desc.trim()) sections.push(`Description: ${desc.trim()}`);
  const siteName = payload.siteName ?? payload.ogSiteName;
  if (typeof siteName === "string" && siteName.trim()) sections.push(`Site: ${siteName.trim()}`);
  if (typeof row.url === "string" && row.url.trim()) sections.push(`URL: ${row.url.trim()}`);
  if (sections.length === 0) return null;
  return sections.join("\n");
}

async function backfillOpengraph(
  sql,
  apiBaseUrl,
  apiKey,
  model,
  batchSize,
  maxRows,
  dry,
  force,
  timeoutMs,
) {
  const whereClause = force ? sql`` : sql`WHERE qwen_4b_fp16_embedding IS NULL`;
  const countResult = await sql`SELECT count(*)::int as c FROM opengraph_metadata ${whereClause}`;
  const total = countResult[0].c;
  console.log(`${P} opengraph: ${total} rows to process`);
  if (total === 0) return;
  let processed = 0,
    updated = 0,
    skipped = 0;
  while (maxRows === undefined || processed < maxRows) {
    const limit = maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processed);
    if (limit <= 0) break;
    const offset = force ? processed : 0;
    const rows = await sql`
      SELECT url_hash, url, payload FROM opengraph_metadata
      ${whereClause} ORDER BY url_hash LIMIT ${limit} OFFSET ${offset}`;
    if (rows.length === 0) break;
    const texts = [];
    const validRows = [];
    for (const row of rows) {
      const text = buildOgText(row);
      if (!text) {
        skipped++;
        continue;
      }
      texts.push(text);
      validRows.push(row);
    }
    if (texts.length === 0) {
      processed += rows.length;
      continue;
    }
    const embeddings = await embedTexts(apiBaseUrl, apiKey, model, texts, timeoutMs);
    processed += rows.length;
    if (dry) {
      console.log(`${P} opengraph: dry-run processed=${processed}/${total}`);
      continue;
    }
    for (let i = 0; i < validRows.length; i++) {
      await sql`UPDATE opengraph_metadata SET qwen_4b_fp16_embedding = ${serializeHalfvec(embeddings[i])}::halfvec(2560)
        WHERE url_hash = ${validRows[i].url_hash}`;
      updated++;
    }
    console.log(`${P} opengraph: processed=${processed}/${total} updated=${updated}`);
  }
  console.log(`${P} opengraph: DONE updated=${updated} skipped=${skipped}`);
}

// ─── Thoughts ────────────────────────────────────────────

function buildThoughtText(row) {
  const sections = [`Title: ${row.title}`];
  if (typeof row.category === "string" && row.category.trim()) {
    sections.push(`Category: ${row.category.trim()}`);
  }
  if (Array.isArray(row.tags) && row.tags.length > 0) {
    sections.push(`Tags: ${row.tags.filter(Boolean).join(", ")}`);
  }
  if (typeof row.content === "string" && row.content.trim()) {
    sections.push(`Content: ${row.content.trim()}`);
  }
  return sections.join("\n");
}

async function backfillThoughts(
  sql,
  apiBaseUrl,
  apiKey,
  model,
  batchSize,
  maxRows,
  dry,
  force,
  timeoutMs,
) {
  const whereClause = force ? sql`` : sql`WHERE qwen_4b_fp16_embedding IS NULL`;
  const countResult = await sql`SELECT count(*)::int as c FROM thoughts ${whereClause}`;
  const total = countResult[0].c;
  console.log(`${P} thoughts: ${total} rows to process`);
  if (total === 0) return;
  let processed = 0,
    updated = 0;
  while (maxRows === undefined || processed < maxRows) {
    const limit = maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processed);
    if (limit <= 0) break;
    const offset = force ? processed : 0;
    const rows = await sql`
      SELECT id, title, content, category, tags FROM thoughts
      ${whereClause} ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
    if (rows.length === 0) break;
    const texts = rows.map(buildThoughtText);
    const embeddings = await embedTexts(apiBaseUrl, apiKey, model, texts, timeoutMs);
    processed += rows.length;
    if (dry) {
      console.log(`${P} thoughts: dry-run processed=${processed}/${total}`);
      continue;
    }
    for (let i = 0; i < rows.length; i++) {
      await sql`UPDATE thoughts SET qwen_4b_fp16_embedding = ${serializeHalfvec(embeddings[i])}::halfvec(2560)
        WHERE id = ${rows[i].id}`;
      updated++;
    }
    console.log(`${P} thoughts: processed=${processed}/${total} updated=${updated}`);
  }
  console.log(`${P} thoughts: DONE updated=${updated}`);
}

// ─── Main ────────────────────────────────────────────────

async function run() {
  const dry = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const domain = flagVal("--domain");
  const batchSize = Math.min(
    parsePositiveInt(flagVal("--batch-size"), "batch-size") ?? DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
  );
  const maxRows = parsePositiveInt(flagVal("--max-rows"), "max-rows");
  const timeoutMs = parsePositiveInt(flagVal("--timeout"), "timeout") ?? DEFAULT_TIMEOUT_MS;
  if (!dry) assertProdWrite("domain-embeddings-backfill");
  const apiBaseUrl = buildApiBaseUrl(readEnv("AI_DEFAULT_OPENAI_BASE_URL"));
  const apiKey = readEnv("AI_DEFAULT_OPENAI_API_KEY");
  const model = readEnv("AI_DEFAULT_EMBEDDING_MODEL");
  const sql = postgres(readEnv("DATABASE_URL"), { ssl: "require", max: 1, connect_timeout: 10 });
  console.log(
    `${P} Starting (dry=${dry}, force=${force}, domain=${domain ?? "all"}, batch=${batchSize})`,
  );
  const ok = (d) => !domain || domain === d;
  try {
    if (ok("ai-analysis"))
      await backfillAiAnalysis(
        sql,
        apiBaseUrl,
        apiKey,
        model,
        batchSize,
        maxRows,
        dry,
        force,
        timeoutMs,
      );
    if (ok("opengraph"))
      await backfillOpengraph(
        sql,
        apiBaseUrl,
        apiKey,
        model,
        batchSize,
        maxRows,
        dry,
        force,
        timeoutMs,
      );
    if (ok("thoughts"))
      await backfillThoughts(
        sql,
        apiBaseUrl,
        apiKey,
        model,
        batchSize,
        maxRows,
        dry,
        force,
        timeoutMs,
      );
    // Final counts
    const rows = await sql`
      SELECT 'ai_analysis_latest' as t, count(*)::int as total, count(qwen_4b_fp16_embedding)::int as with_emb FROM ai_analysis_latest UNION ALL
      SELECT 'opengraph_metadata', count(*)::int, count(qwen_4b_fp16_embedding)::int FROM opengraph_metadata UNION ALL
      SELECT 'thoughts', count(*)::int, count(qwen_4b_fp16_embedding)::int FROM thoughts
      ORDER BY t`;
    console.log(`\n${P} Embedding coverage:`);
    for (const r of rows) {
      const pct = r.total > 0 ? ((r.with_emb / r.total) * 100).toFixed(1) : "N/A";
      console.log(`  ${r.t}: ${r.with_emb}/${r.total} (${pct}%)`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
