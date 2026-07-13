import { GET } from "@/app/api/search/bookmarks/route";
import { endpointCompatibleEmbeddingConfigSchema } from "@/types/schemas/ai-openai-compatible";
import { unifiedBookmarkSchema } from "@/types/schemas/bookmark";
import { bookmarkSearchResponseSchema } from "@/types/schemas/search";
import { NextRequest } from "next/server";

const {
  mockEmbedTextsWithEndpointCompatibleModel,
  mockHybridSearchBookmarks,
  mockResolveDefaultEndpointCompatibleEmbeddingConfig,
  mockSearchBookmarksFtsPage,
} = vi.hoisted(() => ({
  mockEmbedTextsWithEndpointCompatibleModel: vi.fn(),
  mockHybridSearchBookmarks: vi.fn(),
  mockResolveDefaultEndpointCompatibleEmbeddingConfig: vi.fn(),
  mockSearchBookmarksFtsPage: vi.fn(),
}));

vi.mock("@/lib/db/queries/bookmarks", () => ({
  searchBookmarksFtsPage: mockSearchBookmarksFtsPage,
}));

vi.mock("@/lib/db/queries/hybrid-search", () => ({
  hybridSearchBookmarks: mockHybridSearchBookmarks,
}));

vi.mock("@/lib/ai/openai-compatible/embeddings-client", () => ({
  embedTextsWithEndpointCompatibleModel: mockEmbedTextsWithEndpointCompatibleModel,
}));

vi.mock("@/lib/ai/openai-compatible/feature-config", () => ({
  resolveDefaultEndpointCompatibleEmbeddingConfig:
    mockResolveDefaultEndpointCompatibleEmbeddingConfig,
}));

describe("Bookmarks Search API", () => {
  const idMatch1 = "bk-1";
  const idMatch2 = "bk-2";

  const matchedBookmarks = [
    unifiedBookmarkSchema.parse({
      id: idMatch1,
      url: "https://example.com/sdk1",
      title: "SDK for Claude Code (CLI)",
      description: "CLI tool",
      slug: "sdk-for-claude-code",
      tags: [],
      dateBookmarked: "2025-01-01",
      sourceUpdatedAt: "2025-01-01",
      scrapedContentText: "Full scraped page content must never cross the search API boundary.",
    }),
    unifiedBookmarkSchema.parse({
      id: idMatch2,
      url: "https://example.com/sdk2",
      title: "Another SDK article",
      description: "Docs",
      slug: "another-sdk-article",
      tags: [],
      dateBookmarked: "2025-01-02",
      sourceUpdatedAt: "2025-01-02",
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDefaultEndpointCompatibleEmbeddingConfig.mockReturnValue(null);
    mockSearchBookmarksFtsPage.mockResolvedValue({
      totalCount: matchedBookmarks.length,
      items: matchedBookmarks.map((bookmark, index) => ({ bookmark, score: 1 - index * 0.1 })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only compact matched-bookmark projections", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/search/bookmarks?q=sdk&page=1&limit=24",
      { headers: new Headers([["x-forwarded-for", "127.0.0.1"]]) },
    );

    const response = await GET(request);
    const body: unknown = await response.json();
    const parsed = bookmarkSearchResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain("Full scraped page content");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.hasMore).toBe(false);
    expect(parsed.meta.scope).toBe("bookmarks");
    expect(parsed.meta.query).toBe("sdk");
    expect(parsed.results).toEqual([
      {
        id: idMatch1,
        type: "bookmark",
        title: "SDK for Claude Code (CLI)",
        description: "CLI tool",
        url: "/bookmarks/sdk-for-claude-code",
        score: 1,
      },
      {
        id: idMatch2,
        type: "bookmark",
        title: "Another SDK article",
        description: "Docs",
        url: "/bookmarks/another-sdk-article",
        score: 0.9,
      },
    ]);
  });

  it("rejects non-compact result metadata at the response boundary", () => {
    const result = bookmarkSearchResponseSchema.safeParse({
      results: [
        {
          id: "bk-1",
          type: "bookmark",
          title: "Bookmark",
          url: "/bookmarks/bk-1",
          score: 1,
          metadata: { scrapedContentText: "private" },
        },
      ],
      totalCount: 1,
      hasMore: false,
      meta: {
        query: "bookmark",
        scope: "bookmarks",
        count: 1,
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.success).toBe(false);
  });

  it("returns the canonical validation error for a missing query", async () => {
    const request = new NextRequest("http://localhost:3000/api/search/bookmarks", {
      headers: { "x-forwarded-for": "127.0.0.2" },
    });

    const response = await GET(request);
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Query must be a non-empty string" });
    expect(mockSearchBookmarksFtsPage).not.toHaveBeenCalled();
  });

  it("logs embedding failures and returns keyword-only production results", async () => {
    const embeddingFailure = new Error("embedding provider unavailable");
    const embeddingConfig = endpointCompatibleEmbeddingConfigSchema.parse({
      baseUrl: "https://embeddings.example.test",
      apiKey: "test-key",
      embeddingSpaceId: "qwen3-embedding-4b",
      model: "text-embedding-qwen3-embedding-4b",
    });
    const keywordOnlyHits = matchedBookmarks.map((bookmark, index) => ({
      bookmark,
      score: 1 - index * 0.1,
    }));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "production");
    mockResolveDefaultEndpointCompatibleEmbeddingConfig.mockReturnValue(embeddingConfig);
    mockEmbedTextsWithEndpointCompatibleModel.mockRejectedValue(embeddingFailure);
    mockHybridSearchBookmarks.mockResolvedValue(keywordOnlyHits);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/bookmarks?q=sdk", {
        headers: { "x-forwarded-for": "127.0.0.3" },
      }),
    );
    const body: unknown = await response.json();
    const parsed = bookmarkSearchResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(parsed.results).toHaveLength(2);
    expect(mockHybridSearchBookmarks).toHaveBeenCalledWith({
      query: "sdk",
      embedding: undefined,
      limit: 100,
    });
    expect(mockSearchBookmarksFtsPage).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[BookmarksSearchRoute] Embedding generation failed; continuing with keyword-only scoring:",
      embeddingFailure,
    );
  });
});

afterAll(() => {
  vi.doUnmock("@/lib/db/queries/bookmarks");
  vi.resetModules();
});
