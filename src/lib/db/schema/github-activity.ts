import { bigint, index, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const GITHUB_ACTIVITY_DATA_TYPES = [
  "activity",
  "summary",
  "aggregated-weekly",
  "repo-weekly-stats",
  "csv-checksum",
] as const;

/**
 * Discriminated key-value store for all GitHub activity data types.
 *
 * Each document is uniquely identified by (dataType, qualifier):
 *   - dataType: "activity" | "summary" | "aggregated-weekly" | "repo-weekly-stats" | "csv-checksum"
 *   - qualifier: "global" for singletons, "owner/repo" for per-repo data
 *
 * The payload column holds the validated JSON data for each document type.
 */
export const githubActivityStore = pgTable(
  "github_activity_store",
  {
    dataType: text("data_type").notNull().$type<(typeof GITHUB_ACTIVITY_DATA_TYPES)[number]>(),
    qualifier: text("qualifier").notNull().default("global"),
    payload: jsonb("payload").notNull(),
    checksum: text("checksum"),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dataType, table.qualifier] }),
    index("idx_github_activity_store_type_qualifier").on(table.dataType, table.qualifier),
    index("idx_github_activity_store_updated_at").on(table.updatedAt),
  ],
);

/** The singleton qualifier used for non-per-repo documents. */
export const GITHUB_ACTIVITY_GLOBAL_QUALIFIER = "global" as const;
