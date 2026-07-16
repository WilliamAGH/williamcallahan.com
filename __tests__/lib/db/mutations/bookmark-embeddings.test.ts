const mocks = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn();
  const values = vi.fn((_input: unknown) => ({ onConflictDoUpdate }));
  const where = vi.fn();
  const deleteRows = vi.fn(() => ({ where }));
  const insert = vi.fn(() => ({ values }));
  const transaction = vi.fn((operation: (transaction: unknown) => Promise<unknown>) =>
    operation({ delete: deleteRows, insert }),
  );

  return {
    assertDatabaseWriteAllowed: vi.fn(),
    deleteRows,
    embed: vi.fn<(args: unknown) => Promise<number[][]>>(),
    execute: vi.fn<(query: unknown) => Promise<unknown[]>>(),
    getRetryAfterMilliseconds: vi.fn(),
    insert,
    onConflictDoUpdate,
    resolveConfig: vi.fn(),
    transaction,
    upsertBookmarks: vi.fn(),
    values,
    where,
  };
});

vi.mock("@/lib/ai/openai-compatible/embeddings-client", () => ({
  embedTextsWithEndpointCompatibleModel: mocks.embed,
  getEndpointCompatibleEmbeddingRetryAfterMilliseconds: mocks.getRetryAfterMilliseconds,
}));

vi.mock("@/lib/ai/openai-compatible/feature-config", () => ({
  resolveDefaultEndpointCompatibleEmbeddingConfig: mocks.resolveConfig,
}));

vi.mock("@/lib/db/connection", () => ({
  assertDatabaseWriteAllowed: mocks.assertDatabaseWriteAllowed,
  db: {
    execute: mocks.execute,
    insert: mocks.insert,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/db/mutations/bookmarks", () => ({
  upsertUnifiedBookmarks: mocks.upsertBookmarks,
}));

import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import {
  backfillBookmarkEmbeddings,
  BOOKMARK_EMBEDDING_BATCH_SIZE,
} from "@/lib/db/mutations/bookmark-embeddings";
import {
  backfillDueBookmarkEmbeddings,
  writeBookmarkMasterFiles,
} from "@/lib/bookmarks/persistence.server";
import type { BookmarkEmbeddingSelect } from "@/types/db/bookmarks";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";
import { is, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const embeddingConfig = {
  model: "text-embedding-qwen3-embedding-4b",
  baseUrl: "https://example.test",
  apiKey: "test-key",
  embeddingSpaceId: "qwen3-embedding-4b",
};

function createBookmarkEmbeddingRow(id: string): BookmarkEmbeddingSelect {
  return {
    id,
    url: `https://example.test/${id}`,
    title: `Bookmark ${id}`,
    description: "A bookmark for embedding tests.",
    summary: null,
    note: null,
    domain: "example.test",
    scrapedContentText: null,
    tags: [],
    content: null,
  };
}

function createEmbedding(): number[] {
  return Array.from({ length: CONTENT_EMBEDDING_DIMENSIONS }, () => 0.25);
}

function createUnifiedBookmark(id: string): UnifiedBookmark {
  return unifiedBookmarkSchema.parse({
    id,
    slug: `bookmark-${id}`,
    url: `https://example.test/${id}`,
    title: `Bookmark ${id}`,
    description: "A bookmark for embedding tests.",
    tags: [],
    dateBookmarked: "2026-07-15T00:00:00.000Z",
    sourceUpdatedAt: "2026-07-15T00:00:00.000Z",
  });
}

function renderExecuteSql(callIndex: number): { sql: string; params: unknown[] } {
  const query = mocks.execute.mock.calls[callIndex]?.[0];
  if (!is(query, SQL)) throw new Error("Expected db.execute to receive a SQL query.");
  return new PgDialect().sqlToQuery(query);
}

describe("backfillBookmarkEmbeddings", () => {
  beforeEach(() => {
    mocks.assertDatabaseWriteAllowed.mockReset();
    mocks.deleteRows.mockClear();
    mocks.embed.mockReset();
    mocks.execute.mockReset();
    mocks.getRetryAfterMilliseconds.mockReset().mockReturnValue(undefined);
    mocks.insert.mockClear();
    mocks.onConflictDoUpdate.mockReset().mockResolvedValue(undefined);
    mocks.resolveConfig.mockReset().mockReturnValue(embeddingConfig);
    mocks.transaction.mockClear();
    mocks.upsertBookmarks.mockReset().mockResolvedValue(undefined);
    mocks.values.mockClear();
    mocks.where.mockReset().mockResolvedValue(undefined);
    process.env.AI_DEFAULT_EMBEDDING_MODEL = embeddingConfig.model;
    delete process.env.IS_DATA_UPDATER;
  });

  afterEach(() => {
    delete process.env.AI_DEFAULT_EMBEDDING_MODEL;
    delete process.env.IS_DATA_UPDATER;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("bounds a dedicated updater write to one canonical embedding batch", async () => {
    process.env.IS_DATA_UPDATER = "true";
    const bookmarks = Array.from({ length: BOOKMARK_EMBEDDING_BATCH_SIZE + 1 }, (_, index) =>
      createUnifiedBookmark(`scheduler-${index}`),
    );
    const rows = bookmarks.map((bookmark) => createBookmarkEmbeddingRow(bookmark.id));
    mocks.execute
      .mockResolvedValueOnce(rows.slice(0, BOOKMARK_EMBEDDING_BATCH_SIZE))
      .mockResolvedValueOnce([{ cnt: bookmarks.length }]);
    mocks.embed.mockRejectedValueOnce(new Error("upstream unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await writeBookmarkMasterFiles(bookmarks);

    expect(mocks.upsertBookmarks).toHaveBeenCalledWith(bookmarks);
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.embed.mock.calls[0]?.[0]).toMatchObject({
      input: expect.arrayContaining([expect.any(String)]),
      retry: { maxRetries: 2, baseDelayMs: 1_000, maxDelayMs: 15_000 },
    });
    expect(renderExecuteSql(0).params).toContain(BOOKMARK_EMBEDDING_BATCH_SIZE);
  });

  it("advances due checkpoints in a later updater cycle within the same bound", async () => {
    process.env.IS_DATA_UPDATER = "true";
    const bookmarks = Array.from({ length: BOOKMARK_EMBEDDING_BATCH_SIZE + 1 }, (_, index) =>
      createUnifiedBookmark(`due-${index}`),
    );
    const rows = bookmarks
      .slice(0, BOOKMARK_EMBEDDING_BATCH_SIZE)
      .map((bookmark) => createBookmarkEmbeddingRow(bookmark.id));
    mocks.execute.mockResolvedValueOnce(rows).mockResolvedValueOnce([{ cnt: 1 }]);
    mocks.embed.mockResolvedValueOnce(rows.map(() => createEmbedding()));

    await backfillDueBookmarkEmbeddings(bookmarks);

    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledTimes(BOOKMARK_EMBEDDING_BATCH_SIZE);
    expect(renderExecuteSql(0).params).toContain(BOOKMARK_EMBEDDING_BATCH_SIZE);
  });

  it("keeps interactive bookmark writes on a single upstream attempt", async () => {
    const bookmark = createUnifiedBookmark("interactive");
    mocks.execute
      .mockResolvedValueOnce([createBookmarkEmbeddingRow(bookmark.id)])
      .mockResolvedValueOnce([{ cnt: 1 }]);
    mocks.embed.mockRejectedValueOnce(new Error("upstream unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await writeBookmarkMasterFiles([bookmark]);

    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.embed.mock.calls[0]?.[0]).not.toHaveProperty("retry");
  });

  it("checkpoints a failed batch and still persists a later successful batch", async () => {
    const first = createBookmarkEmbeddingRow("first");
    const second = createBookmarkEmbeddingRow("second");
    const third = createBookmarkEmbeddingRow("third");
    mocks.execute
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([third])
      .mockResolvedValueOnce([{ cnt: 2 }]);
    mocks.embed.mockRejectedValueOnce(new Error("upstream unavailable"));
    mocks.embed.mockResolvedValueOnce([createEmbedding()]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await backfillBookmarkEmbeddings({
      batchSize: 2,
      maxRows: 3,
      retryTransientFailures: true,
    });

    expect(result).toEqual({
      processedRows: 3,
      updatedRows: 1,
      remainingRows: 2,
      usedModel: embeddingConfig.model,
      dryRun: false,
    });
    expect(mocks.values.mock.calls.find(([rows]) => Array.isArray(rows))?.[0]).toHaveLength(2);
    expect(mocks.embed.mock.calls[0]?.[0]).toHaveProperty("retry", {
      maxRetries: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.deleteRows).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("persists terminal failure state without escalating a scheduler error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const row = createBookmarkEmbeddingRow("failed");
    mocks.execute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ cnt: 1 }]);
    mocks.embed.mockRejectedValueOnce(new Error("provider unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await backfillBookmarkEmbeddings({ maxRows: 1 });

    expect(result).toEqual({
      processedRows: 1,
      updatedRows: 0,
      remainingRows: 1,
      usedModel: embeddingConfig.model,
      dryRun: false,
    });
    expect(mocks.values.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        domain: "bookmark",
        entityId: row.id,
        lastError: "provider unavailable",
        retryAt: Date.now() + 15 * 60 * 1_000,
      }),
    ]);
    expect(warn).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(mocks.embed.mock.calls[0]?.[0]).not.toHaveProperty("retry");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("selects a due checkpoint and atomically clears it after embedding succeeds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const row = createBookmarkEmbeddingRow("due");
    mocks.execute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ cnt: 0 }]);
    mocks.embed.mockResolvedValueOnce([createEmbedding()]);

    const result = await backfillBookmarkEmbeddings({
      maxRows: 1,
      retryTransientFailures: true,
    });

    expect(result.updatedRows).toBe(1);
    expect(renderExecuteSql(0).sql).toContain("ef.retry_at <= $1");
    expect(renderExecuteSql(0).params).toContain(Date.now());
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.deleteRows).toHaveBeenCalledOnce();
  });
});
