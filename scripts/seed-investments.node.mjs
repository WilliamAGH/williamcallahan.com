#!/usr/bin/env node
/**
 * Seed investments table from static data/investments.ts.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). See CLAUDE.md [RT1].
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-investments.node.mjs
 *
 * Flags:
 *   --dry-run   Show what would be seeded without writing
 */

import postgres from "postgres";

const P = "[seed-investments]";
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
  if ((raw === "prod" ? PRODUCTION : raw) !== PRODUCTION)
    throw new Error(`[write-guard] Blocked "${op}": env="${raw}".`);
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function run() {
  const dry = hasFlag("--dry-run");
  if (!dry) assertProdWrite("seed-investments");
  const dbUrl = readEnv("DATABASE_URL");
  const sql = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 10 });

  try {
    // Dynamic import of data — this script is intended to be run via
    // bun run seed:investments (which uses bun as task runner, node as runtime)
    // For CI, pre-compile data/investments.ts to JS first.
    let investments;
    try {
      const mod = await import("../data/investments.ts");
      investments = mod.investments;
    } catch {
      console.error(`${P} Cannot import data/investments.ts directly.`);
      console.error(`${P} This script should be invoked via: bun run seed:investments`);
      console.error(`${P} (bun as task runner will handle TS compilation)`);
      process.exit(1);
    }

    console.log(`${P} Found ${investments.length} investments`);
    if (dry) {
      for (const inv of investments) {
        console.log(`  ${inv.id}: ${inv.name} (${inv.status}, ${inv.stage})`);
      }
      console.log(`${P} Dry run complete.`);
      return;
    }

    let upserted = 0;
    for (const inv of investments) {
      await sql`
        INSERT INTO investments (
          id, name, slug, description, type, stage, category,
          status, operating_status, invested_year,
          founded_year, shutdown_year, acquired_year,
          location, website, aventure_url, logo_only_domain, logo,
          multiple, holding_return, accelerator, details, metrics
        ) VALUES (
          ${inv.id}, ${inv.name}, ${toSlug(inv.name)}, ${inv.description},
          ${inv.type}, ${inv.stage}, ${inv.category ?? null},
          ${inv.status}, ${inv.operating_status}, ${inv.invested_year},
          ${inv.founded_year ?? null}, ${inv.shutdown_year ?? null}, ${inv.acquired_year ?? null},
          ${inv.location ?? null}, ${inv.website ?? null}, ${inv.aventure_url ?? null},
          ${inv.logoOnlyDomain ?? null}, ${inv.logo ?? null},
          ${inv.multiple}, ${inv.holding_return},
          ${inv.accelerator ? JSON.stringify(inv.accelerator) : null}::jsonb,
          ${inv.details ? JSON.stringify(inv.details) : null}::jsonb,
          ${inv.metrics ? JSON.stringify(inv.metrics) : null}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, slug = EXCLUDED.slug,
          description = EXCLUDED.description, type = EXCLUDED.type,
          stage = EXCLUDED.stage, category = EXCLUDED.category,
          status = EXCLUDED.status, operating_status = EXCLUDED.operating_status,
          invested_year = EXCLUDED.invested_year,
          founded_year = EXCLUDED.founded_year, shutdown_year = EXCLUDED.shutdown_year,
          acquired_year = EXCLUDED.acquired_year,
          location = EXCLUDED.location, website = EXCLUDED.website,
          aventure_url = EXCLUDED.aventure_url, logo_only_domain = EXCLUDED.logo_only_domain,
          logo = EXCLUDED.logo,
          multiple = EXCLUDED.multiple, holding_return = EXCLUDED.holding_return,
          accelerator = EXCLUDED.accelerator, details = EXCLUDED.details, metrics = EXCLUDED.metrics`;
      upserted++;
    }
    console.log(`${P} Upserted ${upserted} investments`);

    const verify = await sql`SELECT count(*)::int as cnt FROM investments`;
    console.log(`${P} Total in table: ${verify[0].cnt}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
