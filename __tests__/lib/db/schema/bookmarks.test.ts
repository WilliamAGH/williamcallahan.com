import { readdirSync, readFileSync } from "node:fs";
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
    // The newest search_vector migration is the shape production ends on, so
    // that is the one the schema must agree with. Naming a fixed file here made
    // the next rebuild fail this test for the wrong reason.
    const name = readdirSync("drizzle")
      .filter((file) => /^\d+_.*bookmark-search-vector.*\.sql$/.test(file))
      .toSorted()
      .at(-1);
    if (!name) throw new Error("no bookmark-search-vector migration found in drizzle/");

    const migration = readFileSync(`drizzle/${name}`, "utf8");
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
