import { beforeEach, describe, expect, it, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  BOOKMARK_ENRICHMENT_FIELDS,
  mapUnifiedBookmarkToBookmarkInsert,
} from "@/lib/db/bookmark-record-mapper";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn(async () => undefined);
  const deleteRows = vi.fn(() => ({ where }));
  const execute = vi.fn(async () => {
    events.push("lock");
    return [];
  });
  const transactionExecutor = { delete: deleteRows, execute, insert };
  const transaction = vi.fn(async (operation: (executor: unknown) => Promise<unknown>) => {
    events.push("transaction");
    return operation(transactionExecutor);
  });
  const persistedSlugs: Array<{ id: string; slug: string; url: string; title: string }> = [];
  const getSlugMappingRows = vi.fn(async (executor: unknown) => {
    events.push("read");
    return persistedSlugs;
  });

  return {
    assertDatabaseWriteAllowed: vi.fn(),
    deleteRows,
    events,
    execute,
    getSlugMappingRows,
    insert,
    onConflictDoUpdate,
    persistedSlugs,
    transaction,
    transactionExecutor,
    values,
    where,
  };
});

vi.mock("@/lib/db/connection", () => ({
  assertDatabaseWriteAllowed: mocks.assertDatabaseWriteAllowed,
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarkBySlugFromDatabase: vi.fn(),
  getSlugMappingRowsFromDatabase: mocks.getSlugMappingRows,
}));

vi.mock("@/lib/utils/logger");

import {
  buildBookmarkConflictUpdate,
  upsertUnifiedBookmark,
  upsertUnifiedBookmarks,
} from "@/lib/db/mutations/bookmarks";

function buildBookmark(overrides: Partial<UnifiedBookmark> = {}): UnifiedBookmark {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return unifiedBookmarkSchema.parse({
    id: "bm-1",
    slug: "example-com-bm-1",
    url: "https://example.com/article",
    title: "Example",
    description: "An example bookmark",
    tags: [],
    dateBookmarked: timestamp,
    sourceUpdatedAt: timestamp,
    ...overrides,
  });
}

function buildInsert(overrides: Partial<UnifiedBookmark> = {}) {
  return mapUnifiedBookmarkToBookmarkInsert(buildBookmark(overrides));
}

function renderFirstTransactionQuery(): { sql: string; params: unknown[] } {
  const query = mocks.execute.mock.calls[0]?.[0];
  if (!is(query, SQL)) throw new Error("Expected transaction lock SQL.");
  return new PgDialect().sqlToQuery(query);
}

beforeEach(() => {
  mocks.assertDatabaseWriteAllowed.mockClear();
  mocks.deleteRows.mockClear();
  mocks.events.length = 0;
  mocks.execute.mockClear();
  mocks.getSlugMappingRows.mockClear();
  mocks.insert.mockClear();
  mocks.onConflictDoUpdate.mockClear();
  mocks.persistedSlugs.length = 0;
  mocks.transaction.mockClear();
  mocks.values.mockClear();
  mocks.where.mockClear();
});

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

describe("bookmark refresh writes", () => {
  it("locks before reading slug ownership and writes the reconciled dataset in that transaction", async () => {
    mocks.persistedSlugs.push({
      id: "removed-bookmark",
      slug: "github-com-release-notes",
      url: "https://github.com/example/removed",
      title: "Release notes",
    });
    const incoming = buildBookmark({
      id: "incoming-bookmark",
      slug: "github-com-release-notes",
      url: "https://github.com/example/current",
      title: "Release notes",
    });

    const reconciled = await upsertUnifiedBookmarks([incoming]);
    const insertedBookmark = mocks.values.mock.calls[0]?.[0] as { slug?: string } | undefined;

    expect(renderFirstTransactionQuery().sql).toContain(
      "lock table bookmarks in share row exclusive mode",
    );
    expect(mocks.events.slice(0, 3)).toEqual(["transaction", "lock", "read"]);
    expect(mocks.getSlugMappingRows).toHaveBeenCalledWith(mocks.transactionExecutor);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(reconciled[0]?.slug).not.toBe("github-com-release-notes");
    expect(insertedBookmark?.slug).toBe(reconciled[0]?.slug);
    expect(incoming.slug).toBe("github-com-release-notes");
  });

  it("routes a single bookmark write through the same persisted-slug reconciliation", async () => {
    mocks.persistedSlugs.push({
      id: "bm-1",
      slug: "stable-bookmark-url",
      url: "https://example.com/article",
      title: "Original title",
    });

    await upsertUnifiedBookmark(buildBookmark({ slug: "newly-generated-url", title: "Renamed" }));

    const insertedBookmark = mocks.values.mock.calls[0]?.[0] as { slug?: string } | undefined;
    expect(insertedBookmark?.slug).toBe("stable-bookmark-url");
    expect(mocks.getSlugMappingRows).toHaveBeenCalledWith(mocks.transactionExecutor);
    expect(mocks.deleteRows).not.toHaveBeenCalled();
  });

  it("propagates a database conflict instead of swallowing it", async () => {
    mocks.onConflictDoUpdate.mockRejectedValueOnce(new Error("duplicate key value"));

    await expect(upsertUnifiedBookmarks([buildBookmark()])).rejects.toThrow("duplicate key value");

    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
