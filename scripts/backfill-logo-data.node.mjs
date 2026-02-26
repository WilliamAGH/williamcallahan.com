#!/usr/bin/env node

/**
 * Backfill logo_data for bookmarks in PostgreSQL.
 *
 * Reads the logo manifest from S3 CDN and maps each bookmark's domain
 * to its logo CDN URL, writing {url, alt} to the logo_data JSONB column.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production NODE_ENV=production node scripts/backfill-logo-data.node.mjs
 *
 * Flags:
 *   --dry-run       Print what would be updated without writing
 *   --force         Overwrite existing logo_data (default: skip non-null)
 *   --ids id1,id2   Only backfill specific bookmark IDs
 */

import postgres from "postgres";

const PRODUCTION_ENVIRONMENT = "production";

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
 * Resolve the logo manifest S3 path based on environment.
 */
function resolveManifestUrl(cdnBaseUrl) {
  const env = resolveWriteEnvironment().environment;
  const suffix = env === PRODUCTION_ENVIRONMENT ? "" : "-dev";
  return `${cdnBaseUrl}/json/image-data/logos/manifest${suffix}.json`;
}

async function fetchLogoManifest(cdnBaseUrl) {
  const url = resolveManifestUrl(cdnBaseUrl);
  console.log(`[fetch] Loading logo manifest: ${url}`);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Logo manifest fetch failed: HTTP ${response.status} from ${url}`);
  }

  const manifest = await response.json();
  const domainCount = Object.keys(manifest).length;
  console.log(`[fetch] Logo manifest loaded: ${domainCount} domains`);
  return manifest;
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

  if (!DRY_RUN) {
    assertDatabaseWriteAllowed("backfill-logo-data");
  }

  const databaseUrl = readRequiredEnv("DATABASE_URL");
  const cdnBaseUrl = readRequiredEnv("NEXT_PUBLIC_S3_CDN_URL").replace(/\/+$/, "");
  const sql = postgres(databaseUrl);

  console.log("=== Backfill logo_data ===");
  console.log(`  Mode:    ${DRY_RUN ? "DRY RUN" : "LIVE WRITE"}`);
  console.log(`  Force:   ${FORCE ? "yes (overwrite existing)" : "no (skip non-null)"}`);
  console.log(`  Targets: ${TARGET_IDS ? TARGET_IDS.join(", ") : "all bookmarks"}`);
  console.log();

  try {
    const manifest = await fetchLogoManifest(cdnBaseUrl);

    let rows;
    if (TARGET_IDS) {
      rows = await sql`
        SELECT id, domain, logo_data
        FROM bookmarks
        WHERE id = ANY(${sql.array(TARGET_IDS, "text")})
        ORDER BY id ASC
      `;
    } else if (FORCE) {
      rows = await sql`
        SELECT id, domain, logo_data
        FROM bookmarks
        ORDER BY id ASC
      `;
    } else {
      rows = await sql`
        SELECT id, domain, logo_data
        FROM bookmarks
        WHERE logo_data IS NULL
        ORDER BY id ASC
      `;
    }

    console.log(`[db] ${rows.length} rows to process`);

    let updated = 0;
    let skippedNoDomain = 0;
    let skippedNoLogo = 0;
    let skippedUnchanged = 0;

    for (const row of rows) {
      if (!row.domain) {
        skippedNoDomain++;
        continue;
      }

      const logoEntry = manifest[row.domain];
      if (!logoEntry || !logoEntry.cdnUrl) {
        skippedNoLogo++;
        continue;
      }

      const logoData = {
        url: logoEntry.cdnUrl,
        alt: `${row.domain} logo`,
      };

      // Skip if unchanged
      if (!FORCE && row.logo_data && row.logo_data.url === logoData.url) {
        skippedUnchanged++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[dry-run] ${row.id} (${row.domain}): ${logoData.url}`);
        updated++;
        continue;
      }

      await sql`
        UPDATE bookmarks
        SET logo_data = ${sql.json(logoData)}
        WHERE id = ${row.id}
      `;
      updated++;
    }

    console.log();
    console.log("=== Results ===");
    console.log(`  ${DRY_RUN ? "Would update" : "Updated"}:       ${updated}`);
    console.log(`  Skipped (no domain):     ${skippedNoDomain}`);
    console.log(`  Skipped (no logo):       ${skippedNoLogo}`);
    console.log(`  Skipped (unchanged):     ${skippedUnchanged}`);
    console.log(`  Total processed:         ${rows.length}`);

    if (!DRY_RUN && updated > 0) {
      const stats = await sql`
        SELECT
          count(*) FILTER (WHERE logo_data IS NOT NULL) as with_logo,
          count(*) as total
        FROM bookmarks
      `;
      const s = stats[0];
      console.log();
      console.log("=== Post-backfill state ===");
      console.log(
        `  logo_data: ${s.with_logo}/${s.total} populated (${((s.with_logo / s.total) * 100).toFixed(1)}%)`,
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
