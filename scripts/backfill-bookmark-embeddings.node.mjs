#!/usr/bin/env node

import postgres from "postgres";

const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 128;
const DEFAULT_TIMEOUT_MS = 30_000;
const BOOKMARK_EMBEDDING_DIMENSIONS = 2560;
const PRODUCTION_ENVIRONMENT = "production";

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for bookmark embedding backfill.`);
  return value;
}

function buildOpenAiApiBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  url.pathname = basePath.endsWith("/v1") ? basePath : `${basePath}/v1`;
  return url.toString();
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readFlagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function parsePositiveInteger(value, label) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function parseBookmarkIds(value) {
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? [...new Set(ids)] : [];
}

function resolveBatchSize(value) {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`batch-size must be a positive integer. Received: ${value}`);
  }
  if (value > MAX_BATCH_SIZE) {
    throw new Error(`batch-size must be <= ${MAX_BATCH_SIZE}. Received: ${value}`);
  }
  return value;
}

function normalizeEnvironmentName(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "prod") return PRODUCTION_ENVIRONMENT;
  if (normalized === "testing") return "test";
  return normalized;
}

function resolveWriteEnvironment() {
  const deploymentEnvironment = process.env.DEPLOYMENT_ENV?.trim();
  if (deploymentEnvironment) {
    return {
      environment: normalizeEnvironmentName(deploymentEnvironment),
      source: "DEPLOYMENT_ENV",
    };
  }
  const nodeEnvironment = process.env.NODE_ENV?.trim();
  if (nodeEnvironment) {
    return { environment: normalizeEnvironmentName(nodeEnvironment), source: "NODE_ENV" };
  }
  return { environment: "unknown", source: "environment-default" };
}

function assertDatabaseWriteAllowed(operation) {
  const { environment, source } = resolveWriteEnvironment();
  if (environment === PRODUCTION_ENVIRONMENT) {
    return;
  }
  throw new Error(
    `[db/write-guard] Blocked PostgreSQL write "${operation}" because ${source} resolved to "${environment}". ` +
      "This project uses one shared database; only production runtime may write to PostgreSQL.",
  );
}

function parseTagName(tagValue) {
  if (typeof tagValue === "string") {
    const normalized = tagValue.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (tagValue && typeof tagValue === "object" && "name" in tagValue) {
    const nameValue = tagValue.name;
    if (typeof nameValue === "string") {
      const normalized = nameValue.trim();
      return normalized.length > 0 ? normalized : null;
    }
  }
  return null;
}

function collectTagNames(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const tagNames = [];
  for (const tag of rawTags) {
    const parsed = parseTagName(tag);
    if (parsed) tagNames.push(parsed);
  }
  return tagNames;
}

function readContentField(content, key) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const value = content[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
function buildBookmarkEmbeddingInput(row) {
  // --- structured metadata (always fits within 8 192 tokens) ---
  const sections = [`Title: ${row.title}`, `Description: ${row.description}`];
  if (typeof row.summary === "string" && row.summary.trim())
    sections.push(`Summary: ${row.summary.trim()}`);
  if (typeof row.note === "string" && row.note.trim()) sections.push(`Note: ${row.note.trim()}`);
  if (typeof row.domain === "string" && row.domain.trim())
    sections.push(`Domain: ${row.domain.trim()}`);
  const tagNames = collectTagNames(row.tags);
  if (tagNames.length > 0) sections.push(`Tags: ${tagNames.join(", ")}`);

  const contentTitle = readContentField(row.content, "title");
  if (contentTitle && contentTitle !== row.title.trim())
    sections.push(`Content Title: ${contentTitle}`);
  const contentDescription = readContentField(row.content, "description");
  if (contentDescription && contentDescription !== row.description.trim()) {
    sections.push(`Content Description: ${contentDescription}`);
  }
  const author = readContentField(row.content, "author");
  if (author) sections.push(`Author: ${author}`);
  const publisher = readContentField(row.content, "publisher");
  if (publisher) sections.push(`Publisher: ${publisher}`);
  const crawlStatus = readContentField(row.content, "crawlStatus");
  if (crawlStatus) sections.push(`Crawl Status: ${crawlStatus}`);
  const contentAssetId = readContentField(row.content, "contentAssetId");
  if (contentAssetId) sections.push(`Content Asset ID: ${contentAssetId}`);
  const crawledAt = readContentField(row.content, "crawledAt");
  if (crawledAt) sections.push(`Crawled At: ${crawledAt}`);
  const published = readContentField(row.content, "datePublished");
  if (published) sections.push(`Published: ${published}`);
  const updated = readContentField(row.content, "dateModified");
  if (updated) sections.push(`Updated: ${updated}`);

  sections.push(`URL: ${row.url}`);

  // --- scraped content last: server truncation clips only its tail ---
  if (typeof row.scrapedContentText === "string" && row.scrapedContentText.trim()) {
    sections.push(`Scraped Content: ${row.scrapedContentText.trim()}`);
  }

  return sections.join("\n");
}

function buildWhereClauseForMissingEmbeddings(sql, bookmarkIds) {
  if (bookmarkIds === undefined) return sql`where qwen_4b_fp16_embedding is null`;
  if (bookmarkIds.length === 0) return sql`where false`;
  return sql`where qwen_4b_fp16_embedding is null and id = any(${sql.array(bookmarkIds, "text")})`;
}

async function readMissingEmbeddingRows(sql, limit, bookmarkIds) {
  const whereClause = buildWhereClauseForMissingEmbeddings(sql, bookmarkIds);
  return sql`
    select id, url, title, description, summary, note, domain, scraped_content_text as "scrapedContentText", tags, content
    from bookmarks
    ${whereClause}
    order by id asc
    limit ${limit}
  `;
}

async function countMissingEmbeddings(sql, bookmarkIds) {
  const whereClause = buildWhereClauseForMissingEmbeddings(sql, bookmarkIds);
  const rows = await sql`select count(*)::int as count from bookmarks ${whereClause}`;
  return rows[0]?.count ?? 0;
}

async function embedTextsWithEndpointCompatibleModel(args) {
  const signal = AbortSignal.timeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const response = await fetch(`${args.apiBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: args.model, input: args.input }),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `[endpoint-compatible-embeddings] HTTP ${response.status}: ${await response.text()}`,
    );
  }
  const json = await response.json();
  if (!json || !Array.isArray(json.data)) {
    throw new Error("Invalid embeddings response payload: missing data array.");
  }
  const embeddings = [...json.data]
    .toSorted((a, b) => a.index - b.index)
    .map((item) => item.embedding);
  if (embeddings.length !== args.input.length) {
    throw new Error(
      `Embedding count mismatch. Expected ${args.input.length}, received ${embeddings.length}.`,
    );
  }
  return embeddings;
}

function serializeHalfvec(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== BOOKMARK_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimensions must equal ${BOOKMARK_EMBEDDING_DIMENSIONS}. Received ${
        Array.isArray(embedding) ? embedding.length : "non-array"
      }.`,
    );
  }
  const serialized = embedding.map((value, index) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new TypeError(`Embedding contains non-finite value at index ${index}.`);
    }
    return numericValue.toString();
  });
  return `[${serialized.join(",")}]`;
}

async function run() {
  const args = process.argv.slice(2);
  const batchSize = resolveBatchSize(
    parsePositiveInteger(readFlagValue(args, "--batch-size"), "batch-size"),
  );
  const maxRows = parsePositiveInteger(readFlagValue(args, "--max-rows"), "max-rows");
  const bookmarkIds = parseBookmarkIds(readFlagValue(args, "--bookmark-ids"));
  const dryRun = hasFlag(args, "--dry-run");
  const config = {
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    baseUrl: readRequiredEnv("AI_DEFAULT_OPENAI_BASE_URL"),
    apiKey: readRequiredEnv("AI_DEFAULT_OPENAI_API_KEY"),
    model: readRequiredEnv("AI_DEFAULT_EMBEDDING_MODEL"),
  };
  const apiBaseUrl = buildOpenAiApiBaseUrl(config.baseUrl);
  const sql = postgres(config.databaseUrl, { ssl: "require", max: 1, connect_timeout: 10 });
  const startedAt = Date.now();
  let processedRows = 0;
  let updatedRows = 0;

  console.log(
    `[backfill-bookmark-embeddings:node] Starting (dryRun=${dryRun}, batchSize=${batchSize}, maxRows=${
      maxRows ?? "all"
    })`,
  );
  if (bookmarkIds && bookmarkIds.length > 0) {
    console.log(
      `[backfill-bookmark-embeddings:node] Restricting to ${bookmarkIds.length} bookmark IDs.`,
    );
  }
  if (bookmarkIds && bookmarkIds.length === 0) {
    console.log("[backfill-bookmark-embeddings:node] No valid bookmark IDs provided. Exiting.");
    await sql.end({ timeout: 5 });
    return;
  }

  if (!dryRun) {
    assertDatabaseWriteAllowed("bookmarks:embeddings:backfill");
  }

  try {
    while (maxRows === undefined || processedRows < maxRows) {
      const remainingBudget =
        maxRows === undefined ? batchSize : Math.min(batchSize, maxRows - processedRows);
      if (remainingBudget <= 0) break;
      const rows = await readMissingEmbeddingRows(sql, remainingBudget, bookmarkIds);
      if (!rows[0]) break;

      const inputs = rows.map(buildBookmarkEmbeddingInput);
      const embeddings = await embedTextsWithEndpointCompatibleModel({
        apiBaseUrl,
        apiKey: config.apiKey,
        model: config.model,
        input: inputs,
      });
      processedRows += rows.length;

      if (dryRun) {
        const remaining = await countMissingEmbeddings(sql, bookmarkIds);
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(
          `[backfill-bookmark-embeddings:node] dry-run batch processed=${processedRows} remaining=${remaining} elapsed_s=${elapsed}`,
        );
        continue;
      }

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const embedding = embeddings[index];
        if (!row || !embedding) throw new Error(`Missing embedding payload at row index ${index}.`);
        await sql`
          update bookmarks
          set qwen_4b_fp16_embedding = ${serializeHalfvec(embedding)}::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})
          where id = ${row.id}
        `;
        updatedRows += 1;
      }

      const remaining = await countMissingEmbeddings(sql, bookmarkIds);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `[backfill-bookmark-embeddings:node] batch processed=${processedRows} updated=${updatedRows} remaining=${remaining} elapsed_s=${elapsed}`,
      );
    }

    const remainingRows = await countMissingEmbeddings(sql, bookmarkIds);
    console.table({ processedRows, updatedRows, remainingRows, dryRun, model: config.model });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
