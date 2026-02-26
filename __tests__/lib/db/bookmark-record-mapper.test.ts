import {
  mapBookmarkRowToUnifiedBookmark,
  mapUnifiedBookmarkToBookmarkInsert,
} from "@/lib/db/bookmark-record-mapper";
import type { BookmarkRow } from "@/types/db/bookmarks";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

const BASE_BOOKMARK_ROW: BookmarkRow = {
  id: "bookmark-1",
  slug: "bookmark-1",
  url: "https://example.com/bookmark-1",
  title: "Bookmark Title",
  description: "Bookmark Description",
  note: null,
  summary: null,
  tags: [{ id: "tag-1", name: "AI", slug: "ai" }],
  content: null,
  assets: null,
  logoData: null,
  registryLinks: null,
  ogImage: null,
  ogTitle: null,
  ogDescription: null,
  ogUrl: null,
  ogImageExternal: null,
  ogImageLastFetchedAt: null,
  ogImageEtag: null,
  readingTime: null,
  wordCount: null,
  archived: false,
  isPrivate: false,
  isFavorite: true,
  taggingStatus: null,
  domain: null,
  dateBookmarked: "2026-02-25T00:00:00.000Z",
  datePublished: null,
  dateCreated: null,
  dateUpdated: null,
  modifiedAt: null,
  sourceUpdatedAt: "2026-02-25T00:00:00.000Z",
  searchVector: "'bookmark':1A 'titl':2A",
  embedding: null,
};

describe("bookmark-record-mapper", () => {
  it("maps a BookmarkRow to a UnifiedBookmark with optional nulls normalized", () => {
    const unified = mapBookmarkRowToUnifiedBookmark(BASE_BOOKMARK_ROW);

    expect(unified.id).toBe("bookmark-1");
    expect(unified.slug).toBe("bookmark-1");
    expect(unified.url).toBe("https://example.com/bookmark-1");
    expect(unified.title).toBe("Bookmark Title");
    expect(unified.tags).toEqual([{ id: "tag-1", name: "AI", slug: "ai" }]);
    expect(unified.ogImage).toBeUndefined();
    expect(unified.content).toBeUndefined();
    expect(unified.assets).toBeUndefined();
    expect(unified.registryLinks).toBeUndefined();
    expect(unified.isFavorite).toBe(true);
  });

  it("maps a UnifiedBookmark to BookmarkInsert with explicit nullable DB fields", () => {
    const unifiedBookmark: UnifiedBookmark = {
      id: "bookmark-2",
      slug: "bookmark-2",
      url: "https://example.com/bookmark-2",
      title: "Second Bookmark",
      description: "Second description",
      tags: ["database", "search"],
      dateBookmarked: "2026-02-25T10:00:00.000Z",
      sourceUpdatedAt: "2026-02-25T10:00:00.000Z",
      isFavorite: true,
    };

    const insert = mapUnifiedBookmarkToBookmarkInsert(unifiedBookmark);

    expect(insert.id).toBe("bookmark-2");
    expect(insert.slug).toBe("bookmark-2");
    expect(insert.tags).toEqual(["database", "search"]);
    expect(insert.ogImage).toBeNull();
    expect(insert.note).toBeNull();
    expect(insert.summary).toBeNull();
    expect(insert.content).toBeNull();
    expect(insert.assets).toBeNull();
    expect(insert.logoData).toBeNull();
    expect(insert.registryLinks).toBeNull();
    expect(insert.archived).toBe(false);
    expect(insert.isPrivate).toBe(false);
    expect(insert.isFavorite).toBe(true);
  });
});
