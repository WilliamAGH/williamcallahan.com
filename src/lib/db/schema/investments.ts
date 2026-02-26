/**
 * Investments PostgreSQL Schema
 *
 * Static investment portfolio data with FTS + trigram indexes.
 * Embeddings live in embeddings (domain = 'investment').
 *
 * Source data: data/investments.ts (seeded via scripts/seed-investments.node.mjs)
 * Type definition: src/types/investment.ts (Investment interface)
 *
 * @module lib/db/schema/investments
 */

import { type SQL, sql } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Accelerator } from "@/types/schemas/accelerator";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const investments = pgTable(
  "investments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    stage: text("stage").notNull(),
    category: text("category"),
    status: text("status").$type<"Active" | "Realized">().notNull(),
    operatingStatus: text("operating_status")
      .$type<"Operating" | "Shut Down" | "Acquired" | "Inactive">()
      .notNull(),
    investedYear: text("invested_year").notNull(),
    foundedYear: text("founded_year"),
    shutdownYear: text("shutdown_year"),
    acquiredYear: text("acquired_year"),
    location: text("location"),
    website: text("website"),
    aventureUrl: text("aventure_url"),
    logoOnlyDomain: text("logo_only_domain"),
    logo: text("logo"),
    multiple: doublePrecision("multiple").notNull(),
    holdingReturn: doublePrecision("holding_return").notNull(),
    accelerator: jsonb("accelerator").$type<Accelerator | null>(),
    details: jsonb("details").$type<Array<{ label: string; value: string }> | null>(),
    metrics: jsonb("metrics").$type<Record<string, number> | null>(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${investments.name}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${investments.description}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${investments.category}, '') || ' ' || coalesce(${investments.stage}, '')), 'C')
      `,
    ),
  },
  (table) => [
    uniqueIndex("idx_investments_slug").on(table.slug),
    index("idx_investments_search_vector").using("gin", table.searchVector),
    index("idx_investments_name_trgm").using("gin", sql`${table.name} gin_trgm_ops`),
    index("idx_investments_status").on(table.status),
    index("idx_investments_invested_year").on(table.investedYear),
  ],
);
