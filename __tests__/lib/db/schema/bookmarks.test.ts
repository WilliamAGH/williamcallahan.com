import { readFileSync } from "node:fs";
import { getTableColumns, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { bookmarks } from "@/lib/db/schema/bookmarks";

/**
 * Tag names and scraped page text carry evidence that often appears nowhere
 * else on a bookmark, so they belong in the full-text vector. The generated
 * column's expression lives in two places by necessity — the schema owner and
 * the SQL migration that applied it — and a schema edit without a migration
 * silently leaves production on the old vector, so both are checked here.
 */
const TAG_EXTRACTION = "jsonb_path_query_array";

function compiledSearchVectorExpression(): string {
  const generated = getTableColumns(bookmarks).searchVector.generated;
  if (!generated) throw new Error("bookmarks.search_vector is not a generated column");
  const expression = typeof generated.as === "function" ? generated.as() : generated.as;
  return new PgDialect().sqlToQuery(expression as SQL).sql;
}

describe("bookmarks search_vector", () => {
  it("indexes tag names and scraped page text alongside the editorial fields", () => {
    const expression = compiledSearchVectorExpression();

    expect(expression).toContain(TAG_EXTRACTION);
    for (const column of [
      '"title"',
      '"description"',
      '"tags"',
      '"summary"',
      '"note"',
      '"scraped_content_text"',
    ]) {
      expect(expression).toContain(column);
    }
  });

  it("has a migration that rebuilds the column with the schema's exact expression", () => {
    // The shape production ends on is the last search_vector migration the
    // journal lists, not the highest-numbered file on disk: drizzle applies the
    // journal, and this repo already carries 0023_engagement-covering-index.sql
    // with no journal entry. Naming a fixed file here instead made the next
    // rebuild fail this test for the wrong reason.
    const journal: unknown = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    if (
      typeof journal !== "object" ||
      journal === null ||
      !("entries" in journal) ||
      !Array.isArray(journal.entries)
    ) {
      throw new Error("drizzle/meta/_journal.json has no entries array");
    }
    const tags = journal.entries
      .map((entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "tag" in entry &&
        typeof entry.tag === "string"
          ? entry.tag
          : null,
      )
      .filter((tag): tag is string => tag !== null && tag.includes("bookmark-search-vector"));
    const name = tags.at(-1);
    if (!name) throw new Error("no bookmark-search-vector migration listed in the drizzle journal");

    const migration = readFileSync(`drizzle/${name}.sql`, "utf8");
    const generated = migration.match(/GENERATED ALWAYS AS \(([\s\S]*?)\) STORED/);
    if (!generated?.[1]) throw new Error(`${name} has no GENERATED ALWAYS AS expression`);

    // Same expression modulo table qualification and whitespace: a weight or
    // field change on either side fails here.
    const normalize = (sql: string) => sql.replace(/"bookmarks"\./g, "").replace(/\s+/g, "");
    expect(normalize(generated[1])).toBe(normalize(compiledSearchVectorExpression()));
    expect(migration).toContain('ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "search_vector"');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "idx_bookmarks_search_vector"');
  });
});
