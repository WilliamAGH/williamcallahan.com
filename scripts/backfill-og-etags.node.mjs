#!/usr/bin/env node

/**
 * Backfill og_image_etag via HEAD requests to each bookmark's og_image URL.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). Bun's TLS
 * implementation fails SSL negotiation with PostgreSQL. See CLAUDE.md [RT1].
 *
 * Sends a HEAD request for every bookmark that has an og_image but is missing
 * og_image_etag.  Also refreshes og_image_last_fetched_at.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-og-etags.node.mjs
 *
 * Flags:
 *   --dry-run       Print what would be updated without writing
 *   --force         Re-check even if og_image_etag is already set
 *   --max-rows N    Limit number of bookmarks to process
 *   --timeout N     Per-request timeout in ms (default: 8000)
 */

import postgres from "postgres";

const PRODUCTION_ENVIRONMENT = "production";
const DEFAULT_TIMEOUT_MS = 8_000;
const CONCURRENCY = 6;

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

/** Normalize an ETag by stripping weak prefix and surrounding quotes. */
function normalizeEtag(raw) {
  if (!raw) return null;
  return raw.replace(/^W\//, "").replaceAll('"', "") || null;
}

/**
 * Send a HEAD request to the image URL and return its ETag (if present).
 */
async function fetchEtag(imageUrl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(imageUrl, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WilliamCallahanBot/1.0; +https://williamcallahan.com)",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const rawEtag = response.headers.get("etag");
    const etag = normalizeEtag(rawEtag);
    return { etag };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("abort")) return { error: "timeout" };
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
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
  const maxRows = readFlagValue("--max-rows");
  const MAX_ROWS = maxRows ? parseInt(maxRows, 10) : undefined;
  const timeoutRaw = readFlagValue("--timeout");
  const TIMEOUT_MS = timeoutRaw ? parseInt(timeoutRaw, 10) : DEFAULT_TIMEOUT_MS;

  if (!DRY_RUN) {
    assertDatabaseWriteAllowed("backfill-og-etags");
  }

  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const sql = postgres(databaseUrl);

  console.log("=== Backfill OG Image ETags ===");
  console.log(`  Mode:    ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`  Force:   ${FORCE ? "yes (re-check all)" : "no (skip existing etags)"}`);
  console.log(`  Timeout: ${TIMEOUT_MS}ms per request`);
  console.log(`  Max:     ${MAX_ROWS ?? "unlimited"}`);
  console.log(`  Workers: ${CONCURRENCY} concurrent`);
  console.log();

  try {
    let rows;
    if (FORCE) {
      rows = await sql`
        SELECT id, og_image, og_image_etag
        FROM bookmarks
        WHERE og_image IS NOT NULL
        ORDER BY id ASC
        ${MAX_ROWS ? sql`LIMIT ${MAX_ROWS}` : sql``}
      `;
    } else {
      rows = await sql`
        SELECT id, og_image, og_image_etag
        FROM bookmarks
        WHERE og_image IS NOT NULL AND og_image_etag IS NULL
        ORDER BY id ASC
        ${MAX_ROWS ? sql`LIMIT ${MAX_ROWS}` : sql``}
      `;
    }

    console.log(`[db] ${rows.length} bookmarks to check`);
    console.log();

    let updated = 0;
    let noEtag = 0;
    let fetchErrors = 0;
    let unchanged = 0;
    const errorSummary = new Map();
    const now = new Date().toISOString();

    await processInBatches(rows, CONCURRENCY, async (row) => {
      const imageUrl = row.og_image;
      if (!imageUrl || imageUrl.startsWith("/")) {
        // Skip relative URLs — HEAD won't work without a host
        noEtag++;
        return;
      }

      // Skip non-HTTP URLs (data:, blob:, etc.)
      if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
        noEtag++;
        return;
      }

      const result = await fetchEtag(imageUrl, TIMEOUT_MS);

      if (result.error) {
        fetchErrors++;
        const bucket = result.error.startsWith("HTTP") ? result.error : result.error.split(":")[0];
        errorSummary.set(bucket, (errorSummary.get(bucket) || 0) + 1);

        // Even on error, update og_image_last_fetched_at to record that we tried
        if (!DRY_RUN) {
          await sql`
            UPDATE bookmarks
            SET og_image_last_fetched_at = ${now}
            WHERE id = ${row.id} AND og_image_last_fetched_at IS NULL
          `;
        }
        return;
      }

      if (!result.etag) {
        noEtag++;
        // Server returned 200 but no ETag header — record the attempt time
        if (!DRY_RUN) {
          await sql`
            UPDATE bookmarks
            SET og_image_last_fetched_at = ${now}
            WHERE id = ${row.id}
          `;
        }
        return;
      }

      // We have an ETag
      if (!FORCE && row.og_image_etag === result.etag) {
        unchanged++;
        return;
      }

      if (DRY_RUN) {
        console.log(`[dry-run] ${row.id}: etag="${result.etag}"`);
        updated++;
        return;
      }

      await sql`
        UPDATE bookmarks
        SET og_image_etag = ${result.etag}, og_image_last_fetched_at = ${now}
        WHERE id = ${row.id}
      `;
      updated++;

      if (updated % 50 === 0) {
        console.log(`[progress] ${updated} updated, ${fetchErrors} errors, ${noEtag} no-etag`);
      }
    });

    console.log();
    console.log("=== Results ===");
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}:  ${updated}`);
    console.log(`  No ETag returned:    ${noEtag}`);
    console.log(`  Fetch errors:        ${fetchErrors}`);
    console.log(`  Unchanged:           ${unchanged}`);
    console.log(`  Total checked:       ${rows.length}`);

    if (errorSummary.size > 0) {
      console.log();
      console.log("=== Error breakdown ===");
      for (const [bucket, count] of [...errorSummary.entries()].toSorted((a, b) => b[1] - a[1])) {
        console.log(`  ${bucket}: ${count}`);
      }
    }

    if (!DRY_RUN) {
      const stats = await sql`
        SELECT
          count(*) FILTER (WHERE og_image_etag IS NOT NULL) as with_etag,
          count(*) FILTER (WHERE og_image_last_fetched_at IS NOT NULL) as with_fetched_at,
          count(*) FILTER (WHERE og_image IS NOT NULL) as with_image,
          count(*) as total
        FROM bookmarks
      `;
      const s = stats[0];
      const pct = (n) => ((n / s.total) * 100).toFixed(1);
      console.log();
      console.log("=== Post-backfill state ===");
      console.log(`  og_image_etag:          ${s.with_etag}/${s.total} (${pct(s.with_etag)}%)`);
      console.log(
        `  og_image_last_fetched_at: ${s.with_fetched_at}/${s.total} (${pct(s.with_fetched_at)}%)`,
      );
      console.log(`  og_image:               ${s.with_image}/${s.total} (${pct(s.with_image)}%)`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
