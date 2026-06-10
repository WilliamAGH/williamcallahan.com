import { describe, expect, it, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  BOOKMARK_ENRICHMENT_FIELDS,
  mapUnifiedBookmarkToBookmarkInsert,
} from "@/lib/db/bookmark-record-mapper";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

vi.mock("@/lib/db/connection", () => ({
  db: {},
  assertDatabaseWriteAllowed: vi.fn(),
}));

import { buildBookmarkConflictUpdate } from "@/lib/db/mutations/bookmarks";

function buildInsert(overrides: Partial<UnifiedBookmark> = {}) {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return mapUnifiedBookmarkToBookmarkInsert({
    id: "bm-1",
    slug: "example-com-bm-1",
    url: "https://example.com/article",
    title: "Example",
    description: "An example bookmark",
    tags: [],
    dateBookmarked: timestamp,
    sourceUpdatedAt: timestamp,
    ...overrides,
  } as UnifiedBookmark);
}

describe("buildBookmarkConflictUpdate", () => {
  it("wraps every enrichment-owned column in COALESCE so incoming NULL keeps the stored value", () => {
    const set = buildBookmarkConflictUpdate(buildInsert());
    const dialect = new PgDialect();

    for (const key of BOOKMARK_ENRICHMENT_FIELDS) {
      const value = set[key];
      if (!is(value, SQL)) {
        throw new Error(`${key} must be a SQL expression`);
      }
      const rendered = dialect.sqlToQuery(value).sql;
      expect(rendered).toContain("coalesce(excluded.");
      expect(rendered).toContain('"bookmarks".');
    }
  });

  it("passes source-owned Karakeep fields through for overwrite", () => {
    const set = buildBookmarkConflictUpdate(
      buildInsert({ title: "Updated title", description: "Updated description" }),
    );

    expect(set.title).toBe("Updated title");
    expect(set.description).toBe("Updated description");
    expect(set.url).toBe("https://example.com/article");
    expect("id" in set).toBe(false);
  });
});
