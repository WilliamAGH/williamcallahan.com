#!/usr/bin/env node
import "dotenv/config";
import OpenAiClient from "openai";
import postgres from "postgres";
import { z } from "zod/v4";

const DEFAULT_LIMIT = 1;
const DEFAULT_RELATED_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_BASE_URL = "https://popos-sf7.com";
const BOOKMARK_SITE_ORIGIN = "https://williamcallahan.com";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const AI_OUTPUT_SCHEMA = z.object({
  aliasMappings: z
    .array(z.object({ alias: z.string().min(1), canonical: z.string().min(1) }))
    .max(80)
    .default([]),
});

function parseArgs(args) {
  let bookmarkId = null;
  let limit = DEFAULT_LIMIT;
  let relatedLimit = DEFAULT_RELATED_LIMIT;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (!value) continue;
    if (value === "--bookmark-id" && args[i + 1]) {
      bookmarkId = args[i + 1];
      i += 1;
      continue;
    }
    if (value.startsWith("--bookmark-id=")) {
      bookmarkId = value.slice(14);
      continue;
    }
    if (value === "--limit" && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10) || DEFAULT_LIMIT;
      i += 1;
      continue;
    }
    if (value.startsWith("--limit=")) {
      limit = Number.parseInt(value.slice(8), 10) || DEFAULT_LIMIT;
      continue;
    }
    if (value === "--related-limit" && args[i + 1]) {
      relatedLimit = Number.parseInt(args[i + 1], 10) || DEFAULT_RELATED_LIMIT;
      i += 1;
      continue;
    }
    if (value.startsWith("--related-limit="))
      relatedLimit = Number.parseInt(value.slice(16), 10) || DEFAULT_RELATED_LIMIT;
  }
  return {
    bookmarkId,
    limit,
    relatedLimit,
    retrofit: args.includes("--retrofit"),
    dryRun: args.includes("--dry-run"),
  };
}

function assertWriteAllowed(dryRun) {
  if (dryRun) return;
  const env = (process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "unknown")
    .trim()
    .toLowerCase();
  if (env !== "production")
    throw new Error(`Writes blocked: DEPLOYMENT_ENV/NODE_ENV resolved to "${env}".`);
}

function buildOpenAiBaseUrl(raw) {
  const parsed = new URL(raw);
  parsed.hash = "";
  parsed.search = "";
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path.endsWith("/v1") ? path : `${path}/v1`;
  return parsed.toString();
}

function resolveModelConfig() {
  const apiKey =
    process.env.AI_BOOKMARK_ANALYSIS_OPENAI_API_KEY?.trim() ||
    process.env.AI_DEFAULT_OPENAI_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      "Missing AI API key (AI_BOOKMARK_ANALYSIS_OPENAI_API_KEY or AI_DEFAULT_OPENAI_API_KEY).",
    );
  const baseUrl =
    process.env.AI_BOOKMARK_ANALYSIS_OPENAI_BASE_URL?.trim() ||
    process.env.AI_DEFAULT_OPENAI_BASE_URL?.trim() ||
    DEFAULT_BASE_URL;
  const modelRaw =
    process.env.AI_BOOKMARK_ANALYSIS_LLM_MODEL?.trim() ||
    process.env.AI_DEFAULT_LLM_MODEL?.trim() ||
    DEFAULT_MODEL;
  const model =
    modelRaw
      .split(",")
      .map((part) => part.trim())
      .find(Boolean) || DEFAULT_MODEL;
  return { apiKey, baseUrl: buildOpenAiBaseUrl(baseUrl), model };
}

function slugifyTag(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\+\+/g, " plus plus ")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function extractTagNames(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const tags = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag === "string") {
      const trimmed = rawTag.trim();
      if (trimmed) tags.push(trimmed);
      continue;
    }
    if (typeof rawTag !== "object" || rawTag === null) continue;
    const maybeName = Reflect.get(rawTag, "name");
    if (typeof maybeName !== "string") continue;
    const trimmed = maybeName.trim();
    if (trimmed) tags.push(trimmed);
  }
  return [...new Set(tags)];
}

function parseStructuredJson(text) {
  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first < 0 || last <= first ? null : tryParse(text.slice(first, last + 1));
}

function formatBookmarkMetadataBlock(bookmark) {
  const name = bookmark.title?.trim() || "(untitled bookmark)";
  const sourceUrl = bookmark.url?.trim() || "(missing source URL)";
  const slugPart = bookmark.slug?.trim() || bookmark.id;
  return `    name: ${name}\n    url: ${sourceUrl}\n    slug: ${BOOKMARK_SITE_ORIGIN}/bookmarks/${slugPart}`;
}

async function readAliasMap(sqlClient, tagSlugs) {
  if (tagSlugs.length === 0) return new Map();
  const rows = await sqlClient`
    SELECT alias_link.source_tag_slug, alias_link.target_tag_slug, canonical.tag_name AS canonical_name
    FROM bookmarks_tags_links AS alias_link
    INNER JOIN bookmarks_tags AS canonical ON canonical.tag_slug = alias_link.target_tag_slug
    WHERE alias_link.link_type = 'alias'
      AND alias_link.source_tag_slug = ANY(${sqlClient.array(tagSlugs)})
  `;
  const aliasBySlug = new Map();
  for (const row of rows)
    aliasBySlug.set(row.source_tag_slug, {
      canonicalSlug: row.target_tag_slug,
      canonicalName: row.canonical_name,
    });
  return aliasBySlug;
}

async function selectCandidateIds(sqlClient, options) {
  if (options.bookmarkId) return [options.bookmarkId];
  if (options.retrofit) {
    const rows = await sqlClient`
      SELECT b.id
      FROM bookmarks AS b
      INNER JOIN bookmark_tag_links AS l ON l.bookmark_id = b.id
      LEFT JOIN bookmarks_tags AS t ON t.tag_slug = l.tag_slug
      WHERE t.tag_slug IS NULL
      GROUP BY b.id
      ORDER BY MAX(b.source_updated_at) DESC NULLS LAST, MAX(b.date_bookmarked) DESC
      LIMIT ${options.limit}
    `;
    return rows.map((row) => row.id);
  }
  const rows = await sqlClient`
    SELECT id FROM bookmarks
    ORDER BY source_updated_at DESC NULLS LAST, date_bookmarked DESC
    LIMIT ${options.limit}
  `;
  return rows.map((row) => row.id);
}

async function selectRelatedIds(sqlClient, bookmarkId, limit) {
  const rows = await sqlClient`
    SELECT e2.entity_id
    FROM embeddings e1, embeddings e2
    WHERE e1.domain = 'bookmark' AND e1.entity_id = ${bookmarkId}
      AND e1.qwen_4b_fp16_embedding IS NOT NULL
      AND e2.domain = 'bookmark' AND e2.entity_id <> e1.entity_id
      AND e2.qwen_4b_fp16_embedding IS NOT NULL
    ORDER BY e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding
    LIMIT ${limit}
  `;
  return rows.map((row) => row.entity_id);
}

async function selectBookmarksByIds(sqlClient, bookmarkIds) {
  if (bookmarkIds.length === 0) return [];
  const rows = await sqlClient`
    SELECT id, slug, title, url, description, summary, note, tags, domain
    FROM bookmarks
    WHERE id = ANY(${sqlClient.array(bookmarkIds)})
  `;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return bookmarkIds.map((id) => byId.get(id)).filter(Boolean);
}

async function requestAliasPlan(client, modelConfig, seedBookmarkId, bookmarks, aliasBySlug) {
  const context = bookmarks.map((bookmark) => {
    const tags = extractTagNames(bookmark.tags);
    const existingAliases = tags
      .map((tag) => {
        const existing = aliasBySlug.get(slugifyTag(tag));
        return existing ? { alias: tag, canonical: existing.canonicalName } : null;
      })
      .filter(Boolean);
    return {
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      tags,
      existingAliases,
    };
  });

  const completion = await client.chat.completions.create({
    model: modelConfig.model,
    temperature: 0.1,
    response_format: { type: "text" },
    messages: [
      {
        role: "system",
        content:
          "You standardize bookmark tags. Return compact JSON only. Output alias mappings only when alias and canonical are truly equivalent.",
      },
      {
        role: "user",
        content: `Seed bookmark ID: ${seedBookmarkId}\nTask:\n1) Propose alias -> canonical tag mappings.\n2) Never map unrelated concepts.\n\nContext JSON:\n${JSON.stringify(context, null, 2)}\n\nReturn JSON: {"aliasMappings":[{"alias":"string","canonical":"string"}]}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM returned empty tag alias response.");
  const rawJson = parseStructuredJson(content);
  if (!rawJson) throw new Error("LLM response did not contain parseable JSON.");
  const parsedPlan = AI_OUTPUT_SCHEMA.parse(rawJson);

  const deduped = new Map();
  for (const mapping of parsedPlan.aliasMappings) {
    const alias = mapping.alias.trim();
    const canonical = mapping.canonical.trim();
    const aliasSlug = slugifyTag(alias);
    const canonicalSlug = slugifyTag(canonical);
    if (!aliasSlug || !canonicalSlug || aliasSlug === canonicalSlug) continue;
    deduped.set(aliasSlug, { alias, canonical, aliasSlug, canonicalSlug });
  }
  return [...deduped.values()];
}

function buildCanonicalizedTags(tags, aliasMappingsBySlug) {
  return extractTagNames(tags).map((tagName) => {
    const mapping = aliasMappingsBySlug.get(slugifyTag(tagName));
    return mapping ? mapping.canonical : tagName;
  });
}

async function applyPlan(sqlClient, seedBookmarkId, bookmarks, aliasMappings, options) {
  const tagUniverse = new Map();
  for (const bookmark of bookmarks) {
    for (const tagName of extractTagNames(bookmark.tags)) {
      const slug = slugifyTag(tagName);
      if (slug && !tagUniverse.has(slug)) tagUniverse.set(slug, tagName);
    }
  }
  for (const mapping of aliasMappings) {
    if (!tagUniverse.has(mapping.canonicalSlug))
      tagUniverse.set(mapping.canonicalSlug, mapping.canonical);
    if (!tagUniverse.has(mapping.aliasSlug)) tagUniverse.set(mapping.aliasSlug, mapping.alias);
  }

  const aliasBySlug = new Map(aliasMappings.map((mapping) => [mapping.aliasSlug, mapping]));
  if (options.dryRun) {
    console.log(`[BookmarkTagIngestion] ${seedBookmarkId} dry-run preview:`);
    for (const bookmark of bookmarks) {
      const beforeTags = extractTagNames(bookmark.tags);
      const afterTags = buildCanonicalizedTags(bookmark.tags, aliasBySlug);
      console.log(
        `  - ${bookmark.id}\n${formatBookmarkMetadataBlock(bookmark)}\n    before tags: ${beforeTags.join(", ") || "none"}\n    after tags:  ${afterTags.join(", ") || "none"}`,
      );
    }
    console.log(`  alias mappings: ${aliasMappings.length}`);
    return;
  }

  const now = Date.now();
  await sqlClient.begin(async (tx) => {
    for (const [tagSlug, tagName] of tagUniverse.entries()) {
      await tx`
        INSERT INTO bookmarks_tags (tag_slug, tag_name, tag_status, created_at, updated_at)
        VALUES (${tagSlug}, ${tagName}, 'primary', ${now}, ${now})
        ON CONFLICT (tag_slug) DO UPDATE
        SET tag_name = EXCLUDED.tag_name,
            updated_at = EXCLUDED.updated_at
      `;
    }

    for (const mapping of aliasMappings) {
      await tx`
        INSERT INTO bookmarks_tags (tag_slug, tag_name, tag_status, created_at, updated_at)
        VALUES (${mapping.aliasSlug}, ${mapping.alias}, 'alias', ${now}, ${now})
        ON CONFLICT (tag_slug) DO UPDATE
        SET tag_name = EXCLUDED.tag_name,
            tag_status = 'alias',
            updated_at = EXCLUDED.updated_at
      `;
      await tx`
        INSERT INTO bookmarks_tags_links (source_tag_slug, target_tag_slug, link_type, created_at, updated_at)
        VALUES (${mapping.aliasSlug}, ${mapping.canonicalSlug}, 'alias', ${now}, ${now})
        ON CONFLICT (source_tag_slug, target_tag_slug) DO UPDATE
        SET updated_at = EXCLUDED.updated_at
      `;
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertWriteAllowed(options.dryRun);
  const modelConfig = resolveModelConfig();
  const sqlClient = postgres(process.env.DATABASE_URL, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  const aiClient = new OpenAiClient({
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseUrl,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 1,
  });

  try {
    const candidateIds = await selectCandidateIds(sqlClient, options);
    if (candidateIds.length === 0) {
      console.log("[BookmarkTagIngestion] No candidate bookmarks found.");
      return;
    }

    for (const seedBookmarkId of candidateIds) {
      const relatedIds = await selectRelatedIds(sqlClient, seedBookmarkId, options.relatedLimit);
      const contextIds = [...new Set([seedBookmarkId, ...relatedIds])].slice(
        0,
        1 + options.relatedLimit,
      );
      const bookmarks = await selectBookmarksByIds(sqlClient, contextIds);
      if (bookmarks.length === 0) {
        console.log(`[BookmarkTagIngestion] Skipping ${seedBookmarkId}; no bookmark rows found.`);
        continue;
      }

      console.log(
        `[BookmarkTagIngestion] Processing ${seedBookmarkId} with ${contextIds.length - 1} related bookmarks.`,
      );
      console.log(`  - ${seedBookmarkId}\n${formatBookmarkMetadataBlock(bookmarks[0])}`);

      const tagSlugs = [
        ...new Set(bookmarks.flatMap((bookmark) => extractTagNames(bookmark.tags).map(slugifyTag))),
      ].filter(Boolean);
      const aliasBySlug = await readAliasMap(sqlClient, tagSlugs);
      const aliasMappings = await requestAliasPlan(
        aiClient,
        modelConfig,
        seedBookmarkId,
        bookmarks,
        aliasBySlug,
      );
      await applyPlan(sqlClient, seedBookmarkId, bookmarks, aliasMappings, options);

      console.log(
        `[BookmarkTagIngestion] ${seedBookmarkId} completed (dryRun=${options.dryRun}) aliases=${aliasMappings.length}`,
      );
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[BookmarkTagIngestion] Failed: ${message}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
});
