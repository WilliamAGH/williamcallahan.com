#!/usr/bin/env node
/**
 * Backfill Qwen3-Embedding-4B embeddings into unified embeddings table.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). See CLAUDE.md [RT1].
 *
 * Handles: ai_analysis_latest, opengraph_metadata, thoughts, investments, books, blog_posts, projects
 * Write target: embeddings (unified table, not domain tables).
 * Labels align with canonical contracts in embedding-field-specs-{content,entities}.ts.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-domain-embeddings.node.mjs
 *
 * Flags:
 *   --dry-run          Show what would be written without writing
 *   --force            Regenerate ALL embeddings (not just missing)
 *   --domain X         Only backfill a specific domain
 *     Valid: ai-analysis, opengraph, thoughts, investments, books, blog-posts, projects
 *   --batch-size N     Texts per API call (default 16, max 128)
 *   --max-rows N       Stop after N rows
 */

import postgres from "postgres";
import {
  buildAiAnalysisText,
  buildOgText,
  buildThoughtText,
  buildInvestmentText,
  buildBookText,
  buildBlogPostText,
  buildProjectText,
} from "./domain-embedding-text-builders.mjs";

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
  if ((raw === "prod" ? PRODUCTION : raw) !== PRODUCTION)
    throw new Error(`[write-guard] Blocked "${op}": env="${raw}".`);
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
  const res = await fetch(`${apiBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Tier": "batch",
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json?.data || !Array.isArray(json.data)) throw new Error("Invalid response: no data array");
  const embeddings = [...json.data].toSorted((a, b) => a.index - b.index).map((d) => d.embedding);
  if (embeddings.length !== input.length)
    throw new Error(`Count mismatch: expected ${input.length}, got ${embeddings.length}`);
  return embeddings;
}

function serializeHalfvec(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS)
    throw new Error(
      `Dimensions must be ${EMBEDDING_DIMENSIONS}, got ${Array.isArray(embedding) ? embedding.length : "non-array"}`,
    );
  for (let i = 0; i < embedding.length; i++)
    if (!Number.isFinite(Number(embedding[i]))) throw new TypeError(`Non-finite at index ${i}`);
  return `[${embedding.join(",")}]`;
}

async function upsertEmbedding(sql, domain, entityId, title, embeddingText, embedding) {
  const vec = serializeHalfvec(embedding);
  await sql`
    INSERT INTO embeddings (domain, entity_id, title, embedding_text, qwen_4b_fp16_embedding, updated_at)
    VALUES (${domain}, ${entityId}, ${title}, ${embeddingText}, ${vec}::halfvec(2560), ${Date.now()})
    ON CONFLICT (domain, entity_id) DO UPDATE SET
      title = EXCLUDED.title, embedding_text = EXCLUDED.embedding_text,
      qwen_4b_fp16_embedding = EXCLUDED.qwen_4b_fp16_embedding, updated_at = EXCLUDED.updated_at`;
}

// ─── Generic Backfill Loop ──────────────────────────────

async function backfillLoop(
  apiBaseUrl,
  apiKey,
  model,
  batchSize,
  maxRows,
  dry,
  force,
  timeoutMs,
  cfg,
) {
  const countResult = await cfg.count(force);
  const total = countResult[0].c;
  console.log(`${P} ${cfg.label}: ${total} rows to process`);
  if (total === 0) return;
  let processed = 0,
    updated = 0,
    skipped = 0;
  while (maxRows === undefined || processed < maxRows) {
    const limit = maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processed);
    if (limit <= 0) break;
    const offset = force || dry ? processed : 0;
    const rows = await cfg.fetch(force, limit, offset);
    if (rows.length === 0) break;
    const texts = [],
      validRows = [];
    for (const row of rows) {
      const text = cfg.buildText(row);
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
      console.log(`${P} ${cfg.label}: dry-run processed=${processed}/${total}`);
      continue;
    }
    for (let i = 0; i < validRows.length; i++) {
      await upsertEmbedding(
        cfg.sql,
        cfg.domain,
        cfg.entityId(validRows[i]),
        cfg.titleFn(validRows[i]),
        texts[i],
        embeddings[i],
      );
      updated++;
    }
    console.log(
      `${P} ${cfg.label}: processed=${processed}/${total} updated=${updated}${skipped ? ` skipped=${skipped}` : ""}`,
    );
  }
  console.log(`${P} ${cfg.label}: DONE updated=${updated}${skipped ? ` skipped=${skipped}` : ""}`);
}

// ─── Domain Configs ──────────────────────────────────────

function aiAnalysisConfig(sql) {
  return {
    sql,
    label: "ai-analysis",
    domain: "ai_analysis",
    buildText: buildAiAnalysisText,
    entityId: (r) => `${r.domain}:${r.entity_id}`,
    titleFn: (r) => r.entity_id,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM ai_analysis_latest`
        : sql`SELECT count(*)::int as c FROM ai_analysis_latest a LEFT JOIN embeddings ce ON ce.domain = 'ai_analysis' AND ce.entity_id = a.domain || ':' || a.entity_id WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT domain, entity_id, payload FROM ai_analysis_latest ORDER BY domain, entity_id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT a.domain, a.entity_id, a.payload FROM ai_analysis_latest a LEFT JOIN embeddings ce ON ce.domain = 'ai_analysis' AND ce.entity_id = a.domain || ':' || a.entity_id WHERE ce.entity_id IS NULL ORDER BY a.domain, a.entity_id LIMIT ${limit} OFFSET ${offset}`,
  };
}

function opengraphConfig(sql) {
  return {
    sql,
    label: "opengraph",
    domain: "opengraph",
    buildText: buildOgText,
    entityId: (r) => r.url_hash,
    titleFn: (r) => r.payload?.title ?? r.payload?.ogTitle ?? r.url ?? "unknown",
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM opengraph_metadata`
        : sql`SELECT count(*)::int as c FROM opengraph_metadata o LEFT JOIN embeddings ce ON ce.domain = 'opengraph' AND ce.entity_id = o.url_hash WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT url_hash, url, payload FROM opengraph_metadata ORDER BY url_hash LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT o.url_hash, o.url, o.payload FROM opengraph_metadata o LEFT JOIN embeddings ce ON ce.domain = 'opengraph' AND ce.entity_id = o.url_hash WHERE ce.entity_id IS NULL ORDER BY o.url_hash LIMIT ${limit} OFFSET ${offset}`,
  };
}

function thoughtsConfig(sql) {
  return {
    sql,
    label: "thoughts",
    domain: "thought",
    buildText: buildThoughtText,
    entityId: (r) => String(r.id),
    titleFn: (r) => r.title,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM thoughts`
        : sql`SELECT count(*)::int as c FROM thoughts t LEFT JOIN embeddings ce ON ce.domain = 'thought' AND ce.entity_id = t.id::text WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT id, title, content, category, tags FROM thoughts ORDER BY id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT t.id, t.title, t.content, t.category, t.tags FROM thoughts t LEFT JOIN embeddings ce ON ce.domain = 'thought' AND ce.entity_id = t.id::text WHERE ce.entity_id IS NULL ORDER BY t.id LIMIT ${limit} OFFSET ${offset}`,
  };
}

function investmentsConfig(sql) {
  return {
    sql,
    label: "investments",
    domain: "investment",
    buildText: buildInvestmentText,
    entityId: (r) => r.id,
    titleFn: (r) => r.name,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM investments`
        : sql`SELECT count(*)::int as c FROM investments i LEFT JOIN embeddings ce ON ce.domain = 'investment' AND ce.entity_id = i.id WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT id, name, description, category, stage, status, operating_status, location, type, invested_year, accelerator FROM investments ORDER BY id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT i.id, i.name, i.description, i.category, i.stage, i.status, i.operating_status, i.location, i.type, i.invested_year, i.accelerator FROM investments i LEFT JOIN embeddings ce ON ce.domain = 'investment' AND ce.entity_id = i.id WHERE ce.entity_id IS NULL ORDER BY i.id LIMIT ${limit} OFFSET ${offset}`,
  };
}

function booksConfig(sql) {
  return {
    sql,
    label: "books",
    domain: "book",
    buildText: buildBookText,
    entityId: (r) => r.id,
    titleFn: (r) => r.title,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM books`
        : sql`SELECT count(*)::int as c FROM books b LEFT JOIN embeddings ce ON ce.domain = 'book' AND ce.entity_id = b.id WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT id, title, subtitle, authors, genres, publisher, description, ai_summary, thoughts FROM books ORDER BY id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT b.id, b.title, b.subtitle, b.authors, b.genres, b.publisher, b.description, b.ai_summary, b.thoughts FROM books b LEFT JOIN embeddings ce ON ce.domain = 'book' AND ce.entity_id = b.id WHERE ce.entity_id IS NULL ORDER BY b.id LIMIT ${limit} OFFSET ${offset}`,
  };
}

function blogPostsConfig(sql) {
  return {
    sql,
    label: "blog-posts",
    domain: "blog",
    buildText: buildBlogPostText,
    entityId: (r) => r.id,
    titleFn: (r) => r.title,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM blog_posts WHERE draft = false`
        : sql`SELECT count(*)::int as c FROM blog_posts bp LEFT JOIN embeddings ce ON ce.domain = 'blog' AND ce.entity_id = bp.id WHERE bp.draft = false AND ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT id, title, excerpt, author_name, tags, raw_content FROM blog_posts WHERE draft = false ORDER BY id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT bp.id, bp.title, bp.excerpt, bp.author_name, bp.tags, bp.raw_content FROM blog_posts bp LEFT JOIN embeddings ce ON ce.domain = 'blog' AND ce.entity_id = bp.id WHERE bp.draft = false AND ce.entity_id IS NULL ORDER BY bp.id LIMIT ${limit} OFFSET ${offset}`,
  };
}

function projectsConfig(sql) {
  return {
    sql,
    label: "projects",
    domain: "project",
    buildText: buildProjectText,
    entityId: (r) => r.id,
    titleFn: (r) => r.name,
    count: (force) =>
      force
        ? sql`SELECT count(*)::int as c FROM projects`
        : sql`SELECT count(*)::int as c FROM projects p LEFT JOIN embeddings ce ON ce.domain = 'project' AND ce.entity_id = p.id WHERE ce.entity_id IS NULL`,
    fetch: (force, limit, offset) =>
      force
        ? sql`SELECT id, name, description, short_summary, url, github_url, tags, tech_stack, note FROM projects ORDER BY id LIMIT ${limit} OFFSET ${offset}`
        : sql`SELECT p.id, p.name, p.description, p.short_summary, p.url, p.github_url, p.tags, p.tech_stack, p.note FROM projects p LEFT JOIN embeddings ce ON ce.domain = 'project' AND ce.entity_id = p.id WHERE ce.entity_id IS NULL ORDER BY p.id LIMIT ${limit} OFFSET ${offset}`,
  };
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
  const args = [apiBaseUrl, apiKey, model, batchSize, maxRows, dry, force, timeoutMs];
  console.log(
    `${P} Starting (dry=${dry}, force=${force}, domain=${domain ?? "all"}, batch=${batchSize})`,
  );
  const ok = (d) => !domain || domain === d;
  try {
    if (ok("ai-analysis")) await backfillLoop(...args, aiAnalysisConfig(sql));
    if (ok("opengraph")) await backfillLoop(...args, opengraphConfig(sql));
    if (ok("thoughts")) await backfillLoop(...args, thoughtsConfig(sql));
    if (ok("investments")) await backfillLoop(...args, investmentsConfig(sql));
    if (ok("books")) await backfillLoop(...args, booksConfig(sql));
    if (ok("blog-posts")) await backfillLoop(...args, blogPostsConfig(sql));
    if (ok("projects")) await backfillLoop(...args, projectsConfig(sql));
    const rows =
      await sql`SELECT domain, count(*)::int as cnt FROM embeddings GROUP BY domain ORDER BY domain`;
    console.log(`\n${P} Embedding coverage (embeddings):`);
    for (const r of rows) console.log(`  ${r.domain}: ${r.cnt}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
