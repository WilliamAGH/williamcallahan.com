#!/usr/bin/env node
/**
 * Seed the investments table from static data/investments.ts through the
 * canonical upsertInvestments mutation (Drizzle), so jsonb columns are
 * serialized once.
 *
 * This script runs under Node.js (CLAUDE.md [RT1]); `tsx` registers the
 * repository TypeScript resolver only for the mutation import.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   DEPLOYMENT_ENV=production node scripts/seed-investments.node.mjs [--dry-run]
 */

import { withDatabase } from "./lib/with-database.node.mjs";

const PREFIX = "[seed-investments]";

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function run() {
  await withDatabase(async () => {
    const { investments } = await import("../data/investments.ts");
    console.log(`${PREFIX} Found ${investments.length} investments`);
    if (hasFlag("--dry-run")) {
      for (const investment of investments) console.log(`  ${investment.id}: ${investment.name}`);
      console.log(`${PREFIX} Dry run complete.`);
      return;
    }

    const { upsertInvestments } = await import("../src/lib/db/mutations/investments.ts");
    const upserted = await upsertInvestments(investments);
    console.log(`${PREFIX} Upserted ${upserted} investments`);
  });
}

await run();
