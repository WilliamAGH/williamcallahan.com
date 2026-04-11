import { GET as getBookmarksRoute } from "@/app/api/bookmarks/route";
import { GET as getFeedRoute } from "@/app/feed.xml/route";
import { getBookmarksIndex, getBookmarksPage } from "@/lib/bookmarks/service.server";
import { getAllPostsMeta } from "@/lib/blog";
import { getDiscoveryRankedBookmarks } from "@/lib/db/queries/discovery-scores";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import type { BookmarkSlugMapping, UnifiedBookmark } from "@/types";

vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/slug-manager");
vi.mock("@/lib/db/queries/discovery-scores");
vi.mock("@/lib/db/queries/discovery-grouped");
vi.mock("@/lib/db/queries/embedding-similarity");
vi.mock("@/lib/blog");
vi.mock("@/data/metadata", () => ({
  metadata: {
    title: "William & Co ]]> Feed",
    description: "Personal <site> & journal ]]> entries",
    site: { url: "https://williamcallahan.com" },
  },
}));

const mockGetBookmarksPage = vi.mocked(getBookmarksPage);
const mockGetBookmarksIndex = vi.mocked(getBookmarksIndex);
const mockGetDiscoveryRankedBookmarks = vi.mocked(getDiscoveryRankedBookmarks);
const mockLoadSlugMapping = vi.mocked(loadSlugMapping);
const mockGetAllPostsMeta = vi.mocked(getAllPostsMeta);

type FeedPost = Awaited<ReturnType<typeof getAllPostsMeta>>[number];

function createBookmark(
  id: string,
  dateBookmarked: string,
  overrides: Partial<UnifiedBookmark> = {},
): UnifiedBookmark {
  return {
    id,
    slug: `slug-${id}`,
    url: `https://example.com/${id}`,
    title: `Bookmark ${id}`,
    description: `Description ${id}`,
    tags: [],
    dateBookmarked,
    sourceUpdatedAt: "2026-02-27T00:00:00.000Z",
    ...overrides,
  } as UnifiedBookmark;
}

function createPost(
  slug: string,
  publishedAt: string,
  overrides: Partial<FeedPost> = {},
): FeedPost {
  return {
    id: slug,
    slug,
    title: `Post ${slug}`,
    excerpt: `Excerpt ${slug}`,
    publishedAt,
    content: {} as FeedPost["content"],
    author: { id: "will", name: "William Callahan" },
    tags: [],
    ...overrides,
  } as FeedPost;
}

function createSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: BookmarkSlugMapping["slugs"] = Object.fromEntries(
    bookmarks.map((bookmark) => [
      bookmark.id,
      {
        id: bookmark.id,
        slug: bookmark.slug,
        url: bookmark.url,
        title: bookmark.title,
      },
    ]),
  );
  const reverseMap: BookmarkSlugMapping["reverseMap"] = Object.fromEntries(
    Object.entries(slugs).map(([id, entry]) => [entry.slug, id]),
  );

  return {
    version: "1.0.0",
    generated: "2026-02-27T00:00:00.000Z",
    count: bookmarks.length,
    checksum: "test-checksum",
    slugs,
    reverseMap,
  };
}

describe("Bookmark feed modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarksIndex.mockResolvedValue({
      count: 4,
      totalPages: 1,
      pageSize: 24,
      lastModified: "2026-02-27T00:00:00.000Z",
      lastFetchedAt: 1_772_451_200_000,
      lastAttemptedAt: 1_772_451_200_000,
      checksum: "test",
      changeDetected: false,
    });
  });

  it("returns chronological data when feed=latest", async () => {
    const latestBookmarks = [
      createBookmark("newest", "2026-02-27T10:00:00.000Z"),
      createBookmark("older", "2026-02-20T10:00:00.000Z"),
    ];
    mockGetBookmarksPage.mockResolvedValue(latestBookmarks);
    mockLoadSlugMapping.mockResolvedValue(createSlugMapping(latestBookmarks));

    const response = await getBookmarksRoute(
      new Request("http://localhost/api/bookmarks?feed=latest&page=1&limit=20"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.feed).toBe("latest");
    expect(payload.data.map((bookmark: UnifiedBookmark) => bookmark.id)).toEqual([
      "newest",
      "older",
    ]);
    expect(mockGetDiscoveryRankedBookmarks).not.toHaveBeenCalled();
  });

  it("returns scored data when feed=discover in ranking order", async () => {
    const ranked = [
      { bookmark: createBookmark("a1", "2026-02-27T10:00:00.000Z") },
      { bookmark: createBookmark("a2", "2026-02-26T10:00:00.000Z") },
      { bookmark: createBookmark("a3", "2026-02-25T10:00:00.000Z") },
      { bookmark: createBookmark("b1", "2026-02-24T10:00:00.000Z") },
    ].map((row, index) => ({
      ...row,
      discoveryScore: 100 - index,
      hasEngagement: true,
    }));

    mockGetDiscoveryRankedBookmarks.mockResolvedValue({ items: ranked, totalCount: ranked.length });
    mockLoadSlugMapping.mockResolvedValue(
      createSlugMapping(ranked.map((entry) => entry.bookmark as UnifiedBookmark)),
    );

    const response = await getBookmarksRoute(
      new Request("http://localhost/api/bookmarks?feed=discover&page=1&limit=4"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.feed).toBe("discover");
    expect(payload.data.map((bookmark: UnifiedBookmark) => bookmark.id)).toEqual([
      "a1",
      "a2",
      "a3",
      "b1",
    ]);
    expect(mockGetDiscoveryRankedBookmarks).toHaveBeenCalledWith(1, 4, { recencyDays: 0 });
  });

  it("returns 500 error when discover ranking fails (no silent fallbacks)", async () => {
    mockGetDiscoveryRankedBookmarks.mockRejectedValueOnce(new Error("relation missing"));

    const response = await getBookmarksRoute(
      new Request("http://localhost/api/bookmarks?feed=discover&page=1&limit=20"),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toBe("Failed to fetch bookmarks");
  });
});

describe("RSS feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the bounded bookmark page query and escapes XML-safe output", async () => {
    mockGetAllPostsMeta.mockResolvedValue([
      createPost("alpha", "2026-02-28T10:00:00.000Z", {
        title: "AI ]]> Notes & Learnings",
        excerpt: "Context ]]> and <tags> & more",
      }),
    ]);
    mockGetBookmarksPage.mockResolvedValue([
      createBookmark("bookmark-1", "2026-02-27T10:00:00.000Z", {
        url: "https://example.com/bookmark-1?x=1&y=2",
        title: "Bookmark ]]> Title",
        description: "",
        summary: "Bookmark summary ]]> <xml> & more",
      }),
    ]);

    const response = await getFeedRoute();
    const xml = await new Response(response.body).text();

    expect(response.headers.get("Content-Type")).toContain("application/rss+xml");
    expect(mockGetBookmarksPage).toHaveBeenCalledWith(1, 100);
    expect(xml).toContain("<title><![CDATA[William & Co ]]]]><![CDATA[> Feed]]></title>");
    expect(xml).toContain(
      "<description><![CDATA[Personal <site> & journal ]]]]><![CDATA[> entries]]></description>",
    );
    expect(xml).toContain("<title><![CDATA[📝 AI ]]]]><![CDATA[> Notes & Learnings]]></title>");
    expect(xml).toContain(
      "<description><![CDATA[Context ]]]]><![CDATA[> and <tags> & more]]></description>",
    );
    expect(xml).toContain("<link>https://williamcallahan.com/bookmarks/slug-bookmark-1</link>");
    expect(xml).toContain(
      "<description><![CDATA[Bookmark summary ]]]]><![CDATA[> <xml> & more]]></description>",
    );
  });

  it("skips entries with invalid dates instead of silently defaulting them", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetAllPostsMeta.mockResolvedValue([
      createPost("invalid-post", "not-a-date", { title: "Invalid post" }),
    ]);
    mockGetBookmarksPage.mockResolvedValue([
      createBookmark("valid-bookmark", "2026-02-27T10:00:00.000Z", { title: "Valid bookmark" }),
      createBookmark("invalid-bookmark", "bad-date", { title: "Invalid bookmark" }),
    ]);

    const response = await getFeedRoute();
    const xml = await new Response(response.body).text();

    expect(response.status).toBe(200);
    expect(xml).toContain("Valid bookmark");
    expect(xml).not.toContain("Invalid post");
    expect(xml).not.toContain("Invalid bookmark");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

    consoleErrorSpy.mockRestore();
  });
});
