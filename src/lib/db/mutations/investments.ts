/**
 * Investment mutations — upsert investment data into PostgreSQL.
 *
 * Source data: data/investments.ts (static portfolio data)
 * Schema: src/lib/db/schema/investments.ts
 *
 * @module lib/db/mutations/investments
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { investments } from "@/lib/db/schema/investments";
import type { Investment } from "@/types/investment";

function investmentToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Upsert a batch of investments.
 * Uses ON CONFLICT on primary key (id) for idempotent writes.
 */
export async function upsertInvestments(data: Investment[]): Promise<number> {
  assertDatabaseWriteAllowed("upsertInvestments");

  let upserted = 0;
  for (const item of data) {
    await db
      .insert(investments)
      .values({
        id: item.id,
        name: item.name,
        slug: investmentToSlug(item.name),
        description: item.description,
        type: item.type,
        stage: item.stage,
        category: item.category ?? null,
        status: item.status,
        operatingStatus: item.operating_status,
        investedYear: item.invested_year,
        foundedYear: item.founded_year ?? null,
        shutdownYear: item.shutdown_year ?? null,
        acquiredYear: item.acquired_year ?? null,
        location: item.location ?? null,
        website: item.website ?? null,
        aventureUrl: item.aventure_url ?? null,
        logoOnlyDomain: item.logoOnlyDomain ?? null,
        logo: item.logo ?? null,
        multiple: item.multiple,
        holdingReturn: item.holding_return,
        accelerator: item.accelerator ?? null,
        details: item.details ?? null,
        metrics: item.metrics ?? null,
      })
      .onConflictDoUpdate({
        target: investments.id,
        set: {
          name: item.name,
          slug: investmentToSlug(item.name),
          description: item.description,
          type: item.type,
          stage: item.stage,
          category: item.category ?? null,
          status: item.status,
          operatingStatus: item.operating_status,
          investedYear: item.invested_year,
          foundedYear: item.founded_year ?? null,
          shutdownYear: item.shutdown_year ?? null,
          acquiredYear: item.acquired_year ?? null,
          location: item.location ?? null,
          website: item.website ?? null,
          aventureUrl: item.aventure_url ?? null,
          logoOnlyDomain: item.logoOnlyDomain ?? null,
          logo: item.logo ?? null,
          multiple: item.multiple,
          holdingReturn: item.holding_return,
          accelerator: item.accelerator ?? null,
          details: item.details ?? null,
          metrics: item.metrics ?? null,
        },
      });
    upserted += 1;
  }
  return upserted;
}
