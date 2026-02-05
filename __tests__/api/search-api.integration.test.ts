/**
 * @file Integration tests for the search API endpoint
 * @description Tests GET /api/search/all for various queries and edge cases
 */

import { vi } from "vitest";
import { GET } from "@/app/api/search/all/route";

// Headers is already available globally via polyfills.js

// Mock search functions to return empty arrays for test environment
// Note: [Blog] prefix is added by the aggregator, not by searchBlogPostsServerSide
vi.mock("@/lib/blog/server-search", () => ({
  searchBlogPostsServerSide: vi.fn().mockResolvedValue([
    {
      id: "1",
      type: "post",
      title: "Test Post 1",
      description: "Test description",
      url: "/blog/test-1",
      score: 1,
    },
    {
      id: "2",
      type: "post",
      title: "Test Post 2",
      description: "Test description",
      url: "/blog/test-2",
      score: 0.8,
    },
  ]),
}));

vi.mock("@/lib/search", () => ({
  searchInvestments: vi.fn().mockResolvedValue([
    {
      id: "inv1",
      type: "project",
      title: "Test Investment",
      description: "Test description",
      url: "/investments#inv1",
      score: 0.9,
    },
  ]),
  searchExperience: vi.fn().mockResolvedValue([
    {
      id: "exp1",
      type: "page",
      title: "Test Experience",
      description: "Test description",
      url: "/experience#exp1",
      score: 0.85,
    },
  ]),
  searchEducation: vi.fn().mockResolvedValue([
    {
      id: "edu1",
      type: "page",
      title: "Test Education",
      description: "Test description",
      url: "/education#edu1",
      score: 0.75,
    },
  ]),
  searchBookmarks: vi.fn().mockResolvedValue([
    {
      id: "bm1",
      type: "bookmark",
      title: "Test Bookmark",
      description: "Test description",
      url: "/bookmarks/test",
      score: 0.7,
    },
  ]),
  searchProjects: vi.fn().mockResolvedValue([
    {
      id: "proj1",
      type: "project",
      title: "Test Project",
      description: "Test description",
      url: "/projects/test",
      score: 0.8,
    },
  ]),
  searchBooks: vi.fn().mockResolvedValue([
    {
      id: "book1",
      type: "book",
      title: "Test Book",
      description: "Test book description",
      url: "/books/test-book",
      score: 0.65,
    },
  ]),
  searchTags: vi.fn().mockResolvedValue([]),
  searchAiAnalysis: vi.fn().mockResolvedValue([]),
  searchThoughts: vi.fn().mockResolvedValue([]),
}));

/**
 * @class MockNextRequest
 * @description Simplified mock of Next.js NextRequest for testing
 */
class MockNextRequest {
  url: string;
  headers: Map<string, string>;

  /**
   * @param {string} url - Full simulated request URL
   */
  constructor(url: string) {
    this.url = url;
    this.headers = new Map();
  }

  /**
   * @returns {URL} URL object from the request URL string
   */
  get nextUrl() {
    return new URL(this.url);
  }
}

describe("Search API: GET /api/search/all", () => {
  describe("API Endpoint Behavior", () => {
    /**
     * @description Should return 400 if query is empty
     */
    it("should return an empty array for an empty query", async () => {
      const request = new MockNextRequest("http://localhost:3000/api/search/all?q=") as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
    });

    /**
     * @description Should return 400 if 'q' parameter is missing
     */
    it("should return a 400 error for a missing query parameter", async () => {
      const request = new MockNextRequest("http://localhost:3000/api/search/all") as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
    });

    /**
     * @description Should handle valid query and return results in standardized format
     */
    it("should process a valid search query and return results", async () => {
      const request = new MockNextRequest("http://localhost:3000/api/search/all?q=test") as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Standardized response format: { results, meta }
      expect(data).toHaveProperty("results");
      expect(data).toHaveProperty("meta");
      expect(Array.isArray(data.results)).toBe(true);
      expect(data.meta).toHaveProperty("query");
      expect(data.meta).toHaveProperty("scope", "all");
      expect(data.meta).toHaveProperty("count");
      expect(data.meta).toHaveProperty("timestamp");

      // Each result should have the required fields
      for (const result of data.results) {
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("url");
        expect(typeof result.title).toBe("string");
        expect(typeof result.url).toBe("string");
      }
    });

    /**
     * @description Should handle queries with special characters
     */
    it("should handle queries with special characters", async () => {
      const specialQuery = encodeURIComponent("test & special <characters>");
      const request = new MockNextRequest(
        `http://localhost:3000/api/search/all?q=${specialQuery}`,
      ) as any;
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    /**
     * @description Should reject queries longer than 100 characters
     */
    it("should return 400 for queries exceeding maximum length", async () => {
      const longQuery = "a".repeat(1000);
      const request = new MockNextRequest(
        `http://localhost:3000/api/search/all?q=${longQuery}`,
      ) as any;
      const response = await GET(request);
      const data = await response.json();

      // Validator enforces 100 character limit
      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Query is too long");
    });

    /**
     * @description Should handle concurrent requests without failing
     */
    it("should successfully manage concurrent requests", async () => {
      const queries = ["test1", "test2", "test3"];
      const requests = queries.map((q) =>
        GET(new MockNextRequest(`http://localhost:3000/api/search/all?q=${q}`) as any),
      );

      const responses = await Promise.all(requests);
      const results = await Promise.all(responses.map((r) => r.json()));

      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // All results should have standardized format
      for (const result of results) {
        expect(result).toHaveProperty("results");
        expect(result).toHaveProperty("meta");
        expect(Array.isArray(result.results)).toBe(true);
      }
    });
  });
});
