#!/usr/bin/env node
/**
 * Seed projects table from static data/projects.ts.
 *
 * IMPORTANT: This script MUST run under Node.js (not bun). See CLAUDE.md [RT1].
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-projects.node.mjs
 *
 * Flags:
 *   --dry-run   Show what would be seeded without writing
 */

import postgres from "postgres";

const P = "[seed-projects]";
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
  if (!dry) assertProdWrite("seed-projects");
  const dbUrl = readEnv("DATABASE_URL");
  const sql = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 10 });

  try {
    let projects;
    try {
      const mod = await import("../data/projects.ts");
      projects = mod.projects;
    } catch {
      console.error(`${P} Cannot import data/projects.ts directly.`);
      console.error(`${P} This script should be invoked via: bun run seed:projects`);
      process.exit(1);
    }

    console.log(`${P} Found ${projects.length} projects`);
    if (dry) {
      for (const proj of projects) {
        console.log(`  ${proj.id ?? toSlug(proj.name)}: ${proj.name}`);
      }
      console.log(`${P} Dry run complete.`);
      return;
    }

    let upserted = 0;
    for (const proj of projects) {
      const id = proj.id ?? toSlug(proj.name);
      await sql`
        INSERT INTO projects (
          id, name, slug, description, short_summary, url,
          github_url, image_key, tags, tech_stack,
          note, cv_featured, registry_links
        ) VALUES (
          ${id}, ${proj.name}, ${toSlug(proj.name)}, ${proj.description},
          ${proj.shortSummary}, ${proj.url},
          ${proj.githubUrl ?? null}, ${proj.imageKey},
          ${proj.tags ? JSON.stringify(proj.tags) : null}::jsonb,
          ${proj.techStack ? JSON.stringify(proj.techStack) : null}::jsonb,
          ${proj.note ?? null}, ${proj.cvFeatured ?? false},
          ${proj.registryLinks ? JSON.stringify(proj.registryLinks) : null}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, slug = EXCLUDED.slug,
          description = EXCLUDED.description, short_summary = EXCLUDED.short_summary,
          url = EXCLUDED.url, github_url = EXCLUDED.github_url,
          image_key = EXCLUDED.image_key, tags = EXCLUDED.tags,
          tech_stack = EXCLUDED.tech_stack, note = EXCLUDED.note,
          cv_featured = EXCLUDED.cv_featured, registry_links = EXCLUDED.registry_links`;
      upserted++;
    }
    console.log(`${P} Upserted ${upserted} projects`);

    const verify = await sql`SELECT count(*)::int as cnt FROM projects`;
    console.log(`${P} Total in table: ${verify[0].cnt}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await run();
