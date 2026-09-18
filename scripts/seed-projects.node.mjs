#!/usr/bin/env node
/**
 * Seed the projects table from static data/projects.ts through the canonical
 * upsertProjects mutation (Drizzle), so jsonb columns are serialized once.
 *
 * This script runs under Node.js (CLAUDE.md [RT1]); `tsx` registers the
 * repository TypeScript resolver only for the mutation import.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-projects.node.mjs [--dry-run]
 */

import { withDatabase } from "./lib/with-database.node.mjs";

const PREFIX = "[seed-projects]";

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function run() {
  await withDatabase(async () => {
    const { projects } = await import("../data/projects.ts");
    console.log(`${PREFIX} Found ${projects.length} projects`);
    if (hasFlag("--dry-run")) {
      for (const project of projects) console.log(`  ${project.id}: ${project.name}`);
      console.log(`${PREFIX} Dry run complete.`);
      return;
    }

    const { upsertProjects } = await import("../src/lib/db/mutations/projects.ts");
    const upserted = await upsertProjects(projects);
    console.log(`${PREFIX} Upserted ${upserted} projects`);
  });
}

await run();
