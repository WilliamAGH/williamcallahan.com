#!/usr/bin/env node

/**
 * Backfill scraped_content_text for all bookmarks in PostgreSQL.
 *
 * Fetches every bookmark from the Karakeep API with includeContent=true,
 * normalizes the raw HTML to clean plain text, and UPDATEs each row.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-scraped-content.node.mjs
 *
 * Flags:
 *   --dry-run       Print what would be updated without writing
 *   --ids id1,id2   Only backfill specific bookmark IDs
 *   --force         Overwrite existing scraped_content_text (default: skip non-null)
 */

import postgres from "postgres";

const PRODUCTION_ENVIRONMENT = "production";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function resolveWriteEnvironment() {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.trim();
  if (deploymentEnv) {
    const normalized = deploymentEnv.toLowerCase() === "prod" ? PRODUCTION_ENVIRONMENT : deploymentEnv.toLowerCase();
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

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function readFlagValue(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const DRY_RUN = hasFlag("--dry-run");
const FORCE = hasFlag("--force");
const IDS_RAW = readFlagValue("--ids");
const TARGET_IDS = IDS_RAW
  ? IDS_RAW.split(",").map((id) => id.trim()).filter((id) => id.length > 0)
  : null;

// ---------------------------------------------------------------------------
// HTML → plain text (standalone, no project imports)
// ---------------------------------------------------------------------------

function stripHtmlToPlainText(html) {
  if (typeof html !== "string" || html.trim().length === 0) return null;
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

// ---------------------------------------------------------------------------
// Karakeep API helpers
// ---------------------------------------------------------------------------

async function fetchAllBookmarksFromApi(apiUrl, listId, bearerToken) {
  const baseUrl = `${apiUrl}/api/v1/lists/${listId}/bookmarks`;
  const allBookmarks = [];
  let cursor = null;
  let page = 0;

  do {
    page++;
    const url = cursor
      ? `${baseUrl}?cursor=${encodeURIComponent(cursor)}&includeContent=true`
      : `${baseUrl}?includeContent=true`;

    console.log(`[fetch] Page ${page}: ${url}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const bookmarks = data.bookmarks ?? [];
    console.log(`[fetch] Page ${page}: received ${bookmarks.length} bookmarks`);
    allBookmarks.push(...bookmarks);
    cursor = data.nextCursor ?? null;
  } while (cursor);

  console.log(`[fetch] Total: ${allBookmarks.length} bookmarks across ${page} pages`);
  return allBookmarks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DRY_RUN) {
    assertDatabaseWriteAllowed("backfill-scraped-content");
  }

  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const apiUrl = readRequiredEnv("BOOKMARKS_API_URL");
  const listId = readRequiredEnv("BOOKMARKS_LIST_ID");
  const bearerToken = readRequiredEnv("BOOKMARK_BEARER_TOKEN");

  console.log("=== Backfill scraped_content_text ===");
  console.log(`  Mode:    ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`  Force:   ${FORCE ? "yes (overwrite existing)" : "no (skip non-null)"}`);
  console.log(`  Targets: ${TARGET_IDS ? TARGET_IDS.join(", ") : "all bookmarks"}`);
  console.log();

  // 1. Fetch all bookmarks from Karakeep API
  const apiBookmarks = await fetchAllBookmarksFromApi(apiUrl, listId, bearerToken);

  // 2. Build id → htmlContent map
  const htmlMap = new Map();
  for (const bm of apiBookmarks) {
    const htmlContent = bm.content?.htmlContent;
    if (typeof htmlContent === "string" && htmlContent.trim().length > 0) {
      htmlMap.set(bm.id, htmlContent);
    }
  }
  console.log(`[normalize] ${htmlMap.size}/${apiBookmarks.length} bookmarks have htmlContent from API`);

  // 3. Connect to PostgreSQL and read current state
  const sql = postgres(databaseUrl);
  try {
    const whereClause = TARGET_IDS
      ? sql`WHERE id = ANY(${sql.array(TARGET_IDS, "text")})`
      : FORCE
        ? sql``
        : sql`WHERE scraped_content_text IS NULL`;

    const rows = await sql`
      SELECT id, scraped_content_text as "scrapedContentText"
      FROM bookmarks
      ${whereClause}
      ORDER BY id ASC
    `;

    console.log(`[db] ${rows.length} rows to process${FORCE ? " (force mode)" : " (null only)"}`);
    console.log();

    // 4. Process each row
    let updated = 0;
    let skipped = 0;
    let noHtml = 0;
    let unchanged = 0;

    for (const row of rows) {
      const rawHtml = htmlMap.get(row.id);
      if (!rawHtml) {
        noHtml++;
        continue;
      }

      const plainText = stripHtmlToPlainText(rawHtml);
      if (!plainText) {
        noHtml++;
        continue;
      }

      // Skip if already has the same content
      if (!FORCE && row.scrapedContentText === plainText) {
        unchanged++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[dry-run] Would update ${row.id}: ${plainText.length} chars`);
        updated++;
        continue;
      }

      await sql`
        UPDATE bookmarks
        SET scraped_content_text = ${plainText}
        WHERE id = ${row.id}
      `;
      updated++;
      console.log(`[update] ${row.id}: ${plainText.length} chars`);
    }

    // 5. Report
    console.log();
    console.log("=== Results ===");
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}:  ${updated}`);
    console.log(`  Skipped (no HTML):      ${noHtml}`);
    console.log(`  Skipped (unchanged):    ${unchanged}`);
    console.log(`  Skipped (already set):  ${skipped}`);
    console.log(`  Total processed:        ${rows.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
