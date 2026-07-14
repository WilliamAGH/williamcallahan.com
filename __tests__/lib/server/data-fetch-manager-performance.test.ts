import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { getInvestmentDomainsAndIds } from "@/lib/data-access/investments";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { refreshBookmarks } from "@/lib/bookmarks/service.server";
import { getBookmarksIndexFromDatabase } from "@/lib/db/queries/bookmarks";
import { buildContentGraph } from "@/lib/content-graph/build";
import type { MockedFunction } from "vitest";
import { bookmarksIndexSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

// Mock dependencies
vi.mock("@/lib/data-access/investments");
vi.mock("@/lib/bookmarks/bookmarks-data-access.server");
vi.mock("@/lib/bookmarks/service.server", () => ({
  refreshBookmarks: vi.fn(),
}));
vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: vi.fn(),
}));
vi.mock("@/lib/bookmarks/refresh-logic.server", () => ({
  initializeBookmarksDataAccess: vi.fn(),
}));
vi.mock("@/lib/content-graph/build", () => ({
  buildContentGraph: vi.fn(),
}));
vi.mock("@/data/experience", () => ({
  experiences: [
    { name: "Company A", website: "https://example-a.com" },
    { name: "Company B", website: "https://example-b.com" },
  ],
}));
vi.mock("@/data/education", () => ({
  education: [{ name: "School A", website: "https://school-a.edu" }],
  certifications: [{ name: "Cert A", website: "https://cert-a.org" }],
  recentCourses: [{ name: "Course A", website: "https://course-a.com" }],
}));

const fixtureDate = "2026-06-10T00:00:00.000Z";

function makeBookmark(overrides: Partial<UnifiedBookmark>): UnifiedBookmark {
  const url = overrides.url ?? "https://bookmark-a.com";
  const title = overrides.title ?? "Bookmark A";
  const description = overrides.description ?? "Description A";
  return {
    id: overrides.id ?? "bookmark-1",
    url,
    title,
    description,
    slug: overrides.slug ?? "bookmark-a",
    tags: overrides.tags ?? [],
    dateBookmarked: overrides.dateBookmarked ?? fixtureDate,
    sourceUpdatedAt: overrides.sourceUpdatedAt ?? fixtureDate,
    content: overrides.content ?? {
      type: "link",
      url,
      title,
      description,
    },
    ...overrides,
  };
}

describe("DataFetchManager Performance Optimizations", () => {
  let mockGetInvestmentDomainsAndIds: MockedFunction<typeof getInvestmentDomainsAndIds>;
  let mockGetBookmarks: MockedFunction<typeof getBookmarks>;
  let mockRefreshBookmarks: MockedFunction<typeof refreshBookmarks>;
  let mockGetBookmarksIndexFromDatabase: MockedFunction<typeof getBookmarksIndexFromDatabase>;
  let mockBuildContentGraph: MockedFunction<typeof buildContentGraph>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetInvestmentDomainsAndIds = getInvestmentDomainsAndIds as MockedFunction<
      typeof getInvestmentDomainsAndIds
    >;
    mockGetBookmarks = getBookmarks as MockedFunction<typeof getBookmarks>;
    mockRefreshBookmarks = refreshBookmarks as MockedFunction<typeof refreshBookmarks>;
    mockGetBookmarksIndexFromDatabase = getBookmarksIndexFromDatabase as MockedFunction<
      typeof getBookmarksIndexFromDatabase
    >;
    mockBuildContentGraph = buildContentGraph as MockedFunction<typeof buildContentGraph>;

    // Mock return values
    mockGetInvestmentDomainsAndIds.mockResolvedValue(
      new Map([
        ["investment-a.com", "inv-1"],
        ["investment-b.com", "inv-2"],
      ]),
    );

    mockGetBookmarks.mockResolvedValue([
      makeBookmark({
        domain: "bookmark-a.com",
      }),
    ]);
    mockRefreshBookmarks.mockResolvedValue([makeBookmark({})]);
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      bookmarksIndexSchema.parse({
        count: 1,
        totalPages: 1,
        pageSize: 24,
        lastModified: fixtureDate,
        lastFetchedAt: 1,
        lastAttemptedAt: 1,
        checksum: "checksum",
        changeDetected: false,
      }),
    );
    mockBuildContentGraph.mockResolvedValue({
      success: true,
      operation: "content-graph",
      itemsProcessed: 0,
    });

    // DataFetchManager uses singleton pattern
  });

  describe("collectAllDomains", () => {
    it("should fetch all data sources in parallel", async () => {
      // Track when each mock is called
      const callTimes: Record<string, number> = {};
      const startTime = Date.now();

      mockGetInvestmentDomainsAndIds.mockImplementation(async () => {
        callTimes.investments = Date.now() - startTime;
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate delay
        return new Map([["investment-a.com", "inv-1"]]);
      });

      mockGetBookmarks.mockImplementation(async () => {
        callTimes.bookmarks = Date.now() - startTime;
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate delay
        return [
          makeBookmark({
            id: "bookmark-1",
            url: "https://bookmark-a.com",
            domain: "bookmark-a.com",
            title: "Bookmark A",
            description: "Description A",
          }),
        ];
      });

      // Create a test instance to access private methods
      const dataFetchManager = new DataFetchManager();
      const domains = await (dataFetchManager as any).collectAllDomains();

      // Verify all data sources were called
      expect(mockGetInvestmentDomainsAndIds).toHaveBeenCalledTimes(1);
      expect(mockGetBookmarks).toHaveBeenCalledWith({
        skipExternalFetch: false,
        includeImageData: false,
      });

      // Verify parallel execution - all should start within a reasonable time of each other
      const timeDifference = Math.abs(callTimes.investments - callTimes.bookmarks);
      expect(timeDifference).toBeLessThan(50); // Should be called almost simultaneously (increased threshold for CI/slower machines)

      // Verify domains were collected correctly
      expect(domains).toBeInstanceOf(Set);
      expect(domains.has("investment-a.com")).toBe(true);
      expect(domains.has("bookmark-a.com")).toBe(true);
      expect(domains.has("example-a.com")).toBe(true); // From experience
      expect(domains.has("example-b.com")).toBe(true); // From experience
      expect(domains.has("school-a.edu")).toBe(true); // From education
      expect(domains.has("cert-a.org")).toBe(true); // From certifications
      expect(domains.has("course-a.com")).toBe(true); // From recent courses
    });

    it("should propagate errors from data sources", async () => {
      // Make investments fail
      mockGetInvestmentDomainsAndIds.mockRejectedValue(new Error("Investment fetch failed"));

      // collectAllDomains now re-throws errors instead of swallowing them
      // This surfaces database failures to fetchLogos which returns { success: false }
      const dataFetchManager = new DataFetchManager();
      await expect((dataFetchManager as any).collectAllDomains()).rejects.toThrow(
        "Investment fetch failed",
      );
    });

    it("should handle invalid URLs gracefully", async () => {
      // Mock bookmarks with invalid URL
      mockGetBookmarks.mockResolvedValue([
        makeBookmark({
          id: "bookmark-1",
          url: "not-a-valid-url",
          title: "Invalid Bookmark",
          description: "Description",
          slug: "invalid-bookmark",
        }),
        makeBookmark({
          id: "bookmark-2",
          url: "https://valid-bookmark.com",
          domain: "valid-bookmark.com",
          title: "Valid Bookmark",
          description: "Description",
          slug: "valid-bookmark",
        }),
      ]);

      const dataFetchManager = new DataFetchManager();
      const domains = await (dataFetchManager as any).collectAllDomains();

      // Should include valid domain but skip invalid one
      expect(domains.has("valid-bookmark.com")).toBe(true);
      expect(domains.has("not-a-valid-url")).toBe(false);
    });

    it("should strip www prefix from domains", async () => {
      mockGetBookmarks.mockResolvedValue([
        makeBookmark({
          id: "bookmark-1",
          url: "https://www.example.com",
          domain: "example.com",
          title: "Example",
          description: "Description",
        }),
      ]);

      const dataFetchManager4 = new DataFetchManager();
      const domains = await (dataFetchManager4 as any).collectAllDomains();

      // Should store without www
      expect(domains.has("example.com")).toBe(true);
      expect(domains.has("www.example.com")).toBe(false);
    });
  });

  describe("bookmark refresh", () => {
    it("uses a database-only comparison before the scheduled refresh", async () => {
      mockGetBookmarks.mockResolvedValue([]);

      const results = await new DataFetchManager().fetchData({
        bookmarks: true,
        forceRefresh: false,
      });

      expect(mockGetBookmarks).toHaveBeenCalledWith({ skipExternalFetch: true });
      expect(mockRefreshBookmarks).toHaveBeenCalledWith(false);
      expect(results[0]).toMatchObject({
        success: true,
        operation: "bookmarks",
        itemsProcessed: 1,
      });
    });
  });

  describe("Performance characteristics", () => {
    it("should complete domain collection faster with parallel execution", async () => {
      // Add delays to simulate real network/database calls
      mockGetInvestmentDomainsAndIds.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return new Map([["investment-a.com", "inv-1"]]);
      });

      mockGetBookmarks.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [
          makeBookmark({
            id: "bookmark-1",
            url: "https://bookmark-a.com",
            domain: "bookmark-a.com",
            title: "Bookmark A",
            description: "Description A",
          }),
        ];
      });

      const dataFetchManager5 = new DataFetchManager();
      const startTime = Date.now();
      await (dataFetchManager5 as any).collectAllDomains();
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With parallel execution, should take ~100-200ms upper bound depending on CI load
      expect(duration).toBeLessThan(225);
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
});
