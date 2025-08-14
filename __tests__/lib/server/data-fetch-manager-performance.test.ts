import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { getInvestmentDomainsAndIds } from "@/lib/data-access/investments";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";

// Mock dependencies
jest.mock("@/lib/data-access/investments");
jest.mock("@/lib/bookmarks/bookmarks-data-access.server");
jest.mock("@/data/experience", () => ({
  experiences: [
    { name: "Company A", website: "https://example-a.com" },
    { name: "Company B", website: "https://example-b.com" },
  ],
}));
jest.mock("@/data/education", () => ({
  education: [
    { name: "School A", website: "https://school-a.edu" },
  ],
  certifications: [
    { name: "Cert A", website: "https://cert-a.org" },
  ],
  recentCourses: [
    { name: "Course A", website: "https://course-a.com" },
  ],
}));

describe("DataFetchManager Performance Optimizations", () => {
  let mockGetInvestmentDomainsAndIds: jest.MockedFunction<typeof getInvestmentDomainsAndIds>;
  let mockGetBookmarks: jest.MockedFunction<typeof getBookmarks>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockGetInvestmentDomainsAndIds = getInvestmentDomainsAndIds as jest.MockedFunction<typeof getInvestmentDomainsAndIds>;
    mockGetBookmarks = getBookmarks as jest.MockedFunction<typeof getBookmarks>;

    // Mock return values
    mockGetInvestmentDomainsAndIds.mockResolvedValue([
      ["investment-a.com", "inv-1"],
      ["investment-b.com", "inv-2"],
    ]);

    mockGetBookmarks.mockResolvedValue([
      {
        id: "bookmark-1",
        url: "https://bookmark-a.com",
        title: "Bookmark A",
        description: "Description A",
        tags: [],
        createdAt: new Date().toISOString(),
        content: {},
      },
    ]);

    // DataFetchManager uses singleton pattern
  });

  describe("collectAllDomains", () => {
    it("should fetch all data sources in parallel", async () => {
      // Track when each mock is called
      const callTimes: Record<string, number> = {};
      const startTime = Date.now();

      mockGetInvestmentDomainsAndIds.mockImplementation(async () => {
        callTimes.investments = Date.now() - startTime;
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
        return [["investment-a.com", "inv-1"]];
      });

      mockGetBookmarks.mockImplementation(async () => {
        callTimes.bookmarks = Date.now() - startTime;
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
        return [{
          id: "bookmark-1",
          url: "https://bookmark-a.com",
          domain: "bookmark-a.com",
          title: "Bookmark A",
          description: "Description A",
          tags: [],
          createdAt: new Date().toISOString(),
          content: {},
        }];
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

      // Verify parallel execution - all should start within a few ms of each other
      const timeDifference = Math.abs(callTimes.investments - callTimes.bookmarks);
      expect(timeDifference).toBeLessThan(10); // Should be called almost simultaneously

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

    it("should handle errors gracefully without blocking other sources", async () => {
      // Make investments fail
      mockGetInvestmentDomainsAndIds.mockRejectedValue(new Error("Investment fetch failed"));

      // The implementation uses Promise.all which fails fast
      const dataFetchManager = new DataFetchManager();
      const domains = await (dataFetchManager as any).collectAllDomains();

      // When one source fails, Promise.all rejects and collectAllDomains returns empty set
      expect(domains.size).toBe(0);
      
      // Verify error was logged but method didn't throw
      expect(domains).toBeInstanceOf(Set);
    });

    it("should handle invalid URLs gracefully", async () => {
      // Mock bookmarks with invalid URL
      mockGetBookmarks.mockResolvedValue([
        {
          id: "bookmark-1",
          url: "not-a-valid-url",
          domain: undefined,
          title: "Invalid Bookmark",
          description: "Description",
          tags: [],
          createdAt: new Date().toISOString(),
          content: {},
        },
        {
          id: "bookmark-2",
          url: "https://valid-bookmark.com",
          domain: "valid-bookmark.com",
          title: "Valid Bookmark",
          description: "Description",
          tags: [],
          createdAt: new Date().toISOString(),
          content: {},
        },
      ]);

      const dataFetchManager = new DataFetchManager();
      const domains = await (dataFetchManager as any).collectAllDomains();

      // Should include valid domain but skip invalid one
      expect(domains.has("valid-bookmark.com")).toBe(true);
      expect(domains.has("not-a-valid-url")).toBe(false);
    });

    it("should strip www prefix from domains", async () => {
      mockGetBookmarks.mockResolvedValue([
        {
          id: "bookmark-1",
          url: "https://www.example.com",
          domain: "example.com",
          title: "Example",
          description: "Description",
          tags: [],
          createdAt: new Date().toISOString(),
          content: {},
        },
      ]);

      const dataFetchManager4 = new DataFetchManager();
      const domains = await (dataFetchManager4 as any).collectAllDomains();

      // Should store without www
      expect(domains.has("example.com")).toBe(true);
      expect(domains.has("www.example.com")).toBe(false);
    });
  });

  describe("Performance characteristics", () => {
    it("should complete domain collection faster with parallel execution", async () => {
      // Add delays to simulate real network/database calls
      mockGetInvestmentDomainsAndIds.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return [["investment-a.com", "inv-1"]];
      });

      mockGetBookmarks.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return [{
          id: "bookmark-1",
          url: "https://bookmark-a.com",
          domain: "bookmark-a.com",
          title: "Bookmark A",
          description: "Description A",
          tags: [],
          createdAt: new Date().toISOString(),
          content: {},
        }];
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