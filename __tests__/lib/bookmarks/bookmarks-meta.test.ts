import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { getAllBookmarks } from "@/lib/db/queries/bookmarks";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getAllBookmarks: vi.fn(),
}));

vi.mock("@/lib/bookmarks/cache-management.server", () => ({
  safeCacheLife: vi.fn(),
  safeCacheTag: vi.fn(),
  invalidateNextJsBookmarksCache: vi.fn(),
  invalidatePageCache: vi.fn(),
  invalidateTagCache: vi.fn(),
}));

vi.mock("@/lib/bookmarks/config", () => ({
  isBookmarkServiceLoggingEnabled: false,
  LOG_PREFIX: "Bookmarks",
  BOOKMARK_SERVICE_LOG_CATEGORY: "Bookmarks",
}));

vi.mock("@/lib/bookmarks/refresh-logic.server", () => ({
  refreshAndPersistBookmarks: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  USE_NEXTJS_CACHE: false,
  withCacheFallback: vi.fn(),
}));

vi.mock("@/lib/utils/env-logger", () => ({
  envLogger: { log: vi.fn() },
}));

const mockGetAllBookmarks = vi.mocked(getAllBookmarks);
const bookmark = unifiedBookmarkSchema.parse({
  id: "bookmark-1",
  url: "https://example.com/article",
  title: "Example article",
  description: "A bookmark used to verify concurrent dataset reads.",
  slug: "example-article",
  tags: [],
  ogImage: "https://example.com/preview.png",
  dateBookmarked: "2026-07-16T00:00:00.000Z",
  sourceUpdatedAt: "2026-07-16T00:00:00.000Z",
});

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => {
    throw new Error("Deferred promise resolver was not initialized.");
  };
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("getBookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves image data for a hydrated caller that starts during a lightweight read", async () => {
    const databaseRead = createDeferred<UnifiedBookmark[]>();
    mockGetAllBookmarks.mockReturnValue(databaseRead.promise);

    const lightweightPromise = getBookmarks({ includeImageData: false });
    const hydratedPromise = getBookmarks({ includeImageData: true });

    databaseRead.resolve([bookmark]);
    const [lightweightBookmarks, hydratedBookmarks] = await Promise.all([
      lightweightPromise,
      hydratedPromise,
    ]);

    expect(lightweightBookmarks[0]).not.toHaveProperty("ogImage");
    expect(hydratedBookmarks[0]).toMatchObject({ id: bookmark.id, ogImage: bookmark.ogImage });
  });
});
