import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for drizzle-kit.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/*.ts",
  out: "./drizzle",
  tablesFilter: [
    "bookmarks",
    "bookmark_tag_links",
    "bookmark_index_state",
    "bookmark_tag_index_state",
    "search_index_artifacts",
    "github_activity_store",
    "content_graph_artifacts",
    "books_latest",
    "books_snapshots",
    "ai_analysis_latest",
    "ai_analysis_versions",
    "opengraph_metadata",
    "opengraph_overrides",
    "thoughts",
    "image_manifests",
    "content_embeddings",
    "investments",
  ],
  schemaFilter: "public",
  dbCredentials: {
    url: databaseUrl,
  },
});
