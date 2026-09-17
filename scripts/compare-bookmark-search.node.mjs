#!/usr/bin/env node

/**
 * Bookmark search parity gate: site hybrid search vs. upstream Karakeep search.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). Bun's TLS
 * implementation fails SSL negotiation with PostgreSQL. See CLAUDE.md [RT1].
 *
 * For each query in the fixed query set below the script calls the upstream
 * Karakeep search API and the site's own search API, then measures how much of
 * Karakeep's answer the site reproduces.
 *
 * Scope rules that make the comparison apples-to-apples:
 *   - Karakeep holds bookmarks outside the mirrored list, so its hits are
 *     restricted to ids that exist in the site's `bookmarks` table. Membership
 *     comes from one `select id from bookmarks` — the same table the site's
 *     search reads, so it is authoritative and needs no pagination (the site's
 *     /api/bookmarks route would need paging and still projects this table).
 *   - The site's /api/search/all caps bookmark results at
 *     MAX_RESULTS_PER_CATEGORY = 24 (src/app/api/search/all/route.ts). Both
 *     engines pad broad queries with semantic neighbours out to their own page
 *     size, so the reference set is Karakeep's top KARAKEEP_REFERENCE_DEPTH
 *     in-scope hits: the site's 24 slots must contain upstream's best answers.
 *     Scoring the full 50-deep upstream tail would measure page sizes, not
 *     accuracy.
 *
 * Gate (all three must hold, else exit code 1):
 *   - mean inclusion >= 0.90
 *   - no single query below 0.50
 *   - site_count >= reference_count for every query
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/compare-bookmark-search.node.mjs
 *
 * Env:
 *   BOOKMARKS_API_URL, BOOKMARK_BEARER_TOKEN, DATABASE_URL  (required)
 *   SITE_SEARCH_BASE   site origin, default http://localhost:3000
 *
 * Flags:
 *   --verbose   print the query rationale list and every missing id/title
 */

import "dotenv/config";
import postgres from "postgres";

/** Karakeep page size per query. */
const KARAKEEP_LIMIT = 50;

/** Bookmark results the site can return; mirrors MAX_RESULTS_PER_CATEGORY. */
const SITE_RESULT_BUDGET = 24;

/** Upstream hits the site's SITE_RESULT_BUDGET slots must contain. */
const KARAKEEP_REFERENCE_DEPTH = 10;

/** Site search API allows 30 requests/min/IP; stay under it. */
const SITE_REQUEST_DELAY_MS = 2_200;

const REQUEST_TIMEOUT_MS = 30_000;

const MEAN_INCLUSION_FLOOR = 0.9;
const PER_QUERY_INCLUSION_FLOOR = 0.5;

/**
 * Fixed query set, every entry derived from a real Karakeep bookmark title or
 * tag so each query has known-relevant upstream results.
 */
const QUERIES = [
  { q: "pgmustard", why: "product name inside a bookmark title, near-unique upstream" },
  { q: "ripwire", why: "repo name (redhat-et/ripwire), single upstream hit" },
  { q: "weknora", why: "repo name (Tencent/WeKnora), single upstream hit" },
  { q: "nitter", why: "project name (zedeus/nitter), distinctive token" },
  { q: "libgdx", why: "framework name, title-only token with no description support" },
  { q: "exoharness", why: "project name spanning several bookmarks" },
  { q: "descript", why: "product name that upstream expands into a long fuzzy tail" },
  { q: "next.js", why: "punctuation inside a token; must stay one term, not two" },
  { q: "trigram grep", why: "two-word phrase describing microsoft/tgrep" },
  { q: "cuda rust gpu kernels", why: "multi-word phrase from an NVIDIA blog title" },
  { q: "safari mcp server", why: "multi-word phrase matching two bookmarks" },
  { q: "postgres query plans", why: "multi-word phrase; title + summary evidence" },
  { q: "qwen3.8 flash next", why: "model name with a version number and punctuation" },
  { q: "screen recorder demo videos", why: "descriptive phrase, no exact title match" },
  { q: "spotify portal token usage", why: "long phrase matching one engineering-blog title" },
  { q: "anti-slop oxlint", why: "hyphenated repo name plus a tool name" },
  { q: "nvfp4", why: "quantization format token that appears only in titles" },
  { q: "dgx spark", why: "hardware name recurring across many bookmark titles" },
  { q: "speculative decoding", why: "Karakeep tag name (14 tagged bookmarks)" },
  { q: "model context protocol", why: "Karakeep tag name (16 tagged bookmarks)" },
  { q: "vector databases", why: "Karakeep tag name (15 tagged bookmarks)" },
  { q: "browser automation", why: "Karakeep tag name (21 tagged bookmarks)" },
  { q: "claude code", why: "Karakeep tag name (42 tagged bookmarks), broad query" },
  { q: "postgress", why: "near-misspelling of postgres; tests fuzzy recall" },
  { q: "annthropic", why: "near-misspelling of anthropic; tests fuzzy recall" },
];

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/** Karakeep base URLs are stored without the API suffix; normalize like lib/constants.ts. */
function normalizeKarakeepBase(rawUrl) {
  const trimmed = rawUrl.replace(/\/?$/, "");
  return /\/api(\/v\d+)?$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url.split("?")[0]} responded ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Upstream hits in upstream rank order: [{ id, title }]. */
async function searchKarakeep(baseUrl, token, query) {
  const url = `${baseUrl}/bookmarks/search?q=${encodeURIComponent(query)}&limit=${KARAKEEP_LIMIT}`;
  const payload = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!Array.isArray(payload?.bookmarks)) {
    throw new TypeError(`Karakeep search returned no bookmarks array for "${query}"`);
  }
  return payload.bookmarks.map((bookmark) => ({
    id: bookmark.id,
    title: bookmark.title ?? bookmark.content?.title ?? bookmark.content?.url ?? "(untitled)",
  }));
}

/** Site hits in site rank order: [id]. */
async function searchSite(siteBase, query) {
  const url = `${siteBase}/api/search/all?q=${encodeURIComponent(query)}&scope=bookmarks`;
  const payload = await fetchJson(url);
  if (!Array.isArray(payload?.results)) {
    throw new TypeError(`Site search returned no results array for "${query}"`);
  }
  return payload.results.map((result) => result.id);
}

function formatRow(cells, widths) {
  return cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const karakeepBase = normalizeKarakeepBase(readRequiredEnv("BOOKMARKS_API_URL"));
  const karakeepToken = readRequiredEnv("BOOKMARK_BEARER_TOKEN");
  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const siteBase = (process.env.SITE_SEARCH_BASE?.trim() || "http://localhost:3000").replace(
    /\/?$/,
    "",
  );

  const sql = postgres(databaseUrl, { ssl: "require", max: 1 });
  let siteBookmarkIds;
  try {
    const rows = await sql`select id from bookmarks`;
    siteBookmarkIds = new Set(rows.map((row) => row.id));
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("=== Bookmark search parity gate ===");
  console.log(`  Site:            ${siteBase}/api/search/all?scope=bookmarks`);
  console.log(`  Site bookmarks:  ${siteBookmarkIds.size}`);
  console.log(
    `  Karakeep limit:  ${KARAKEEP_LIMIT} (reference = top ${KARAKEEP_REFERENCE_DEPTH} in scope)`,
  );
  console.log(`  Site budget:     ${SITE_RESULT_BUDGET} bookmark results per query`);
  console.log(`  Queries:         ${QUERIES.length}`);
  console.log();

  if (verbose) {
    for (const { q, why } of QUERIES) console.log(`  ${q.padEnd(30)} ${why}`);
    console.log();
  }

  const rows = [];
  const upstreamOnlyIds = new Set();

  for (const [index, { q }] of QUERIES.entries()) {
    const karakeepHits = await searchKarakeep(karakeepBase, karakeepToken, q);
    const inScope = karakeepHits.filter((hit) => siteBookmarkIds.has(hit.id));
    for (const hit of karakeepHits) {
      if (!siteBookmarkIds.has(hit.id)) upstreamOnlyIds.add(hit.id);
    }

    const reference = inScope.slice(0, KARAKEEP_REFERENCE_DEPTH);
    const siteIds = await searchSite(siteBase, q);
    const siteIdSet = new Set(siteIds);
    const missing = reference.filter((hit) => !siteIdSet.has(hit.id));
    const inclusion =
      reference.length === 0 ? 1 : (reference.length - missing.length) / reference.length;

    rows.push({
      query: q,
      karakeepCount: karakeepHits.length,
      inScopeCount: inScope.length,
      referenceCount: reference.length,
      siteCount: siteIds.length,
      inclusion,
      missing,
    });

    if (index < QUERIES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SITE_REQUEST_DELAY_MS));
    }
  }

  const widths = [30, 9, 8, 6, 5, 10];
  console.log(formatRow(["query", "karakeep", "inScope", "ref", "site", "inclusion"], widths));
  console.log("-".repeat(widths.reduce((sum, w) => sum + w + 2, 0)));
  for (const row of rows) {
    console.log(
      formatRow(
        [
          row.query,
          row.karakeepCount,
          row.inScopeCount,
          row.referenceCount,
          row.siteCount,
          row.inclusion.toFixed(3),
        ],
        widths,
      ),
    );
  }
  console.log();

  const withMisses = rows.filter((row) => row.missing.length > 0);
  if (withMisses.length > 0) {
    console.log("Missing from site results (present upstream and in the site DB):");
    for (const row of withMisses) {
      const shown = verbose ? row.missing : row.missing.slice(0, 3);
      console.log(`  ${row.query} (${row.missing.length} missing)`);
      for (const hit of shown) {
        console.log(`    ${hit.id}  ${hit.title.slice(0, 80)}`);
      }
      if (shown.length < row.missing.length) {
        console.log(`    ... ${row.missing.length - shown.length} more (--verbose to list)`);
      }
    }
    console.log();
  }

  const meanInclusion = rows.reduce((sum, row) => sum + row.inclusion, 0) / rows.length;
  const worst = rows.reduce((min, row) => (row.inclusion < min.inclusion ? row : min), rows[0]);
  const shortfalls = rows.filter((row) => row.siteCount < row.referenceCount);

  console.log(
    `Karakeep-only bookmarks seen (not in the site DB, out of scope): ${upstreamOnlyIds.size}`,
  );
  console.log(`Mean inclusion:   ${meanInclusion.toFixed(3)} (floor ${MEAN_INCLUSION_FLOOR})`);
  console.log(
    `Worst query:      ${worst.query} @ ${worst.inclusion.toFixed(3)} (floor ${PER_QUERY_INCLUSION_FLOOR})`,
  );
  console.log(
    `Count shortfalls: ${shortfalls.length}${shortfalls.length ? ` (${shortfalls.map((r) => r.query).join(", ")})` : ""}`,
  );

  const passed =
    meanInclusion >= MEAN_INCLUSION_FLOOR &&
    worst.inclusion >= PER_QUERY_INCLUSION_FLOOR &&
    shortfalls.length === 0;

  console.log();
  console.log(passed ? "VERDICT: PASS" : "VERDICT: FAIL");
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
