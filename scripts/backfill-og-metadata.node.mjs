#!/usr/bin/env node

/**
 * Backfill OpenGraph metadata (og_title, og_description, og_image) for bookmarks.
 *
 * Fetches each bookmark's URL, parses <meta property="og:*"> tags from the HTML
 * <head>, and UPDATEs the corresponding PostgreSQL columns.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-og-metadata.node.mjs
 *
 * Flags:
 *   --dry-run       Print what would be updated without writing
 *   --force         Overwrite existing non-null OG fields (default: skip non-null)
 *   --ids id1,id2   Only backfill specific bookmark IDs
 *   --max-rows N    Limit number of bookmarks to process
 *   --timeout N     Per-request timeout in ms (default: 10000)
 */

import postgres from "postgres";

const PRODUCTION_ENVIRONMENT = "production";
const DEFAULT_TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

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

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}
function readFlagValue(flag) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

/**
 * Fetch a URL and extract OpenGraph meta tags from <head>.
 * Reads only the first ~64 KB to avoid downloading full page bodies.
 */
async function fetchOgMetadata(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WilliamCallahanBot/1.0; +https://williamcallahan.com)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/xhtml")) {
      return { error: `Not HTML: ${contentType.split(";")[0]}` };
    }

    // Read only the <head> portion (first ~64 KB is more than enough)
    const reader = response.body?.getReader();
    if (!reader) return { error: "No response body" };

    let accumulated = "";
    const MAX_BYTES = 65_536;
    let bytesRead = 0;

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += new TextDecoder().decode(value, { stream: true });
      bytesRead += value.length;
      // Stop early once we've seen </head>
      if (accumulated.includes("</head>") || accumulated.includes("</HEAD>")) break;
    }

    reader.cancel().catch(() => {});

    return parseOgTags(accumulated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("abort")) return { error: "timeout" };
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse OG meta tags from an HTML string.
 */
function parseOgTags(html) {
  const result = {};

  // Match <meta property="og:xxx" content="yyy"> (both quote styles, attribute order)
  const metaPattern =
    /<meta\s+[^>]*?(?:property|name)\s*=\s*["']og:(\w+)["'][^>]*?content\s*=\s*["']([^"']*)["'][^>]*?\/?>/gi;
  const metaPatternReverse =
    /<meta\s+[^>]*?content\s*=\s*["']([^"']*)["'][^>]*?(?:property|name)\s*=\s*["']og:(\w+)["'][^>]*?\/?>/gi;

  for (const match of html.matchAll(metaPattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (key && value) result[key] = decodeHtmlEntities(value);
  }

  for (const match of html.matchAll(metaPatternReverse)) {
    const key = match[2]?.toLowerCase();
    const value = match[1]?.trim();
    if (key && value && !result[key]) result[key] = decodeHtmlEntities(value);
  }

  if (!result.title && !result.description && !result.image) {
    // Fallback: try <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      result.title = decodeHtmlEntities(titleMatch[1].trim());
    }
  }

  return Object.keys(result).length > 0 ? result : { error: "No OG tags found" };
}

function decodeHtmlEntities(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#x2F;", "/");
}

async function processInBatches(items, concurrency, handler) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(handler));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  const DRY_RUN = hasFlag("--dry-run");
  const FORCE = hasFlag("--force");
  const idsRaw = readFlagValue("--ids");
  const TARGET_IDS = idsRaw
    ? idsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : null;
  const maxRows = readFlagValue("--max-rows");
  const MAX_ROWS = maxRows ? parseInt(maxRows, 10) : undefined;
  const timeoutRaw = readFlagValue("--timeout");
  const TIMEOUT_MS = timeoutRaw ? parseInt(timeoutRaw, 10) : DEFAULT_TIMEOUT_MS;

  if (!DRY_RUN) {
    assertDatabaseWriteAllowed("backfill-og-metadata");
  }

  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const sql = postgres(databaseUrl);

  console.log("=== Backfill OG metadata ===");
  console.log(`  Mode:    ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`  Force:   ${FORCE ? "yes (overwrite existing)" : "no (skip non-null)"}`);
  console.log(`  Targets: ${TARGET_IDS ? TARGET_IDS.join(", ") : "all bookmarks"}`);
  console.log(`  Timeout: ${TIMEOUT_MS}ms per request`);
  console.log(`  Max:     ${MAX_ROWS ?? "unlimited"}`);
  console.log();

  try {
    let rows;
    if (TARGET_IDS) {
      rows = await sql`
        SELECT id, url, og_title, og_description, og_image
        FROM bookmarks
        WHERE id = ANY(${sql.array(TARGET_IDS, "text")})
        ORDER BY id ASC
      `;
    } else if (FORCE) {
      rows = await sql`
        SELECT id, url, og_title, og_description, og_image
        FROM bookmarks
        ORDER BY id ASC
        ${MAX_ROWS ? sql`LIMIT ${MAX_ROWS}` : sql``}
      `;
    } else {
      rows = await sql`
        SELECT id, url, og_title, og_description, og_image
        FROM bookmarks
        WHERE og_title IS NULL OR og_description IS NULL OR og_image IS NULL
        ORDER BY id ASC
        ${MAX_ROWS ? sql`LIMIT ${MAX_ROWS}` : sql``}
      `;
    }

    console.log(`[db] ${rows.length} rows to process`);
    console.log();

    let updated = 0;
    let skippedNoUrl = 0;
    let skippedUnchanged = 0;
    let fetchErrors = 0;
    const errorSummary = new Map();

    await processInBatches(rows, CONCURRENCY, async (row) => {
      if (!row.url) {
        skippedNoUrl++;
        return;
      }

      const og = await fetchOgMetadata(row.url, TIMEOUT_MS);

      if (og.error) {
        fetchErrors++;
        const bucket = og.error.startsWith("HTTP") ? og.error : og.error.split(":")[0];
        errorSummary.set(bucket, (errorSummary.get(bucket) || 0) + 1);
        return;
      }

      const ogTitle = og.title || null;
      const ogDescription = og.description || null;
      const ogImage = og.image || og.url || null;

      // Skip if nothing changed
      if (
        !FORCE &&
        row.og_title === ogTitle &&
        row.og_description === ogDescription &&
        row.og_image === ogImage
      ) {
        skippedUnchanged++;
        return;
      }

      // Only update fields that are currently null (unless --force)
      const newTitle = FORCE ? ogTitle : (row.og_title ?? ogTitle);
      const newDescription = FORCE ? ogDescription : (row.og_description ?? ogDescription);
      const newImage = FORCE ? ogImage : (row.og_image ?? ogImage);

      if (DRY_RUN) {
        const changes = [];
        if (newTitle !== row.og_title) changes.push(`title="${(newTitle || "").slice(0, 40)}"`);
        if (newDescription !== row.og_description)
          changes.push(`desc="${(newDescription || "").slice(0, 40)}"`);
        if (newImage !== row.og_image) changes.push(`img="${(newImage || "").slice(0, 60)}"`);
        if (changes.length > 0) {
          console.log(`[dry-run] ${row.id}: ${changes.join(", ")}`);
          updated++;
        }
        return;
      }

      await sql`
        UPDATE bookmarks
        SET og_title = ${newTitle}, og_description = ${newDescription}, og_image = ${newImage}
        WHERE id = ${row.id}
      `;
      updated++;
      if (updated % 50 === 0) {
        console.log(
          `[progress] ${updated} updated, ${fetchErrors} errors, ${rows.length - updated - fetchErrors - skippedNoUrl - skippedUnchanged} remaining`,
        );
      }
    });

    console.log();
    console.log("=== Results ===");
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}:       ${updated}`);
    console.log(`  Fetch errors:            ${fetchErrors}`);
    console.log(`  Skipped (no URL):        ${skippedNoUrl}`);
    console.log(`  Skipped (unchanged):     ${skippedUnchanged}`);
    console.log(`  Total processed:         ${rows.length}`);

    if (errorSummary.size > 0) {
      console.log();
      console.log("=== Error breakdown ===");
      for (const [bucket, count] of [...errorSummary.entries()].toSorted((a, b) => b[1] - a[1])) {
        console.log(`  ${bucket}: ${count}`);
      }
    }

    if (!DRY_RUN && updated > 0) {
      const stats = await sql`
        SELECT
          count(*) FILTER (WHERE og_title IS NOT NULL) as with_title,
          count(*) FILTER (WHERE og_description IS NOT NULL) as with_desc,
          count(*) FILTER (WHERE og_image IS NOT NULL) as with_image,
          count(*) as total
        FROM bookmarks
      `;
      const s = stats[0];
      console.log();
      console.log("=== Post-backfill state ===");
      console.log(
        `  og_title:       ${s.with_title}/${s.total} populated (${((s.with_title / s.total) * 100).toFixed(1)}%)`,
      );
      console.log(
        `  og_description: ${s.with_desc}/${s.total} populated (${((s.with_desc / s.total) * 100).toFixed(1)}%)`,
      );
      console.log(
        `  og_image:       ${s.with_image}/${s.total} populated (${((s.with_image / s.total) * 100).toFixed(1)}%)`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
