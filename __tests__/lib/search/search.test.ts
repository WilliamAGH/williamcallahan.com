/**
 * Search Function Tests
 *
 * Tests the search functions exported from lib/search.ts
 * Note: These tests use mocked data modules. MiniSearch behavior may differ
 * from expectations due to fuzzy matching and index building.
 */

// Mock the imported data modules BEFORE imports
vi.mock("@/data/investments", () => ({
  investments: [
    {
      id: "1",
      name: "Test Company 1",
      description: "A fintech startup",
      type: "Seed",
      status: "Active",
      founded_year: "2020",
      invested_year: "2021",
    },
    {
      id: "2",
      name: "Test Company 2",
      description: "An AI company",
      type: "Series A",
      status: "Acquired",
      founded_year: "2019",
      invested_year: "2020",
      acquired_year: "2023",
    },
  ],
}));

vi.mock("@/data/experience", () => ({
  experiences: [
    {
      id: "1",
      company: "Tech Corp",
      role: "Senior Engineer",
      period: "2020-2022",
    },
    {
      id: "2",
      company: "Startup Inc",
      role: "Lead Developer",
      period: "2022-Present",
    },
  ],
}));

vi.mock("@/data/education", () => ({
  education: [
    {
      id: "1",
      institution: "Test University",
      degree: "Computer Science",
    },
  ],
  certifications: [
    {
      id: "2",
      institution: "Tech Cert",
      name: "Advanced Programming",
    },
  ],
}));

vi.mock("@/data/projects", () => ({
  projects: [
    {
      id: "Test Project 1",
      name: "Test Project 1",
      description: "A React-based web application",
      shortSummary: "React web app",
      url: "https://example.com/project1",
      imageKey: "images/projects/project1.png",
      tags: ["react", "typescript"],
    },
    {
      id: "Test Project 2",
      name: "Test Project 2",
      description: "A Node.js API server",
      shortSummary: "Node.js API",
      url: "https://example.com/project2",
      imageKey: "images/projects/project2.png",
      tags: ["nodejs", "api"],
    },
  ],
}));

// Mock S3 utils to prevent loading production indexes (forces in-memory index build with mocked data)
vi.mock("@/lib/s3/json", () => ({
  readJsonS3Optional: vi.fn().mockResolvedValue(null),
}));

// Mock ServerCacheInstance
vi.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: vi.fn(),
    set: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      keys: 0,
      hits: 0,
      misses: 0,
      ksize: 0,
      vsize: 0,
      sizeBytes: 0,
      maxSizeBytes: 0,
      utilizationPercent: 0,
    }),
    getSearchResults: vi.fn(),
    setSearchResults: vi.fn(),
    shouldRefreshSearch: vi.fn(),
    clearAllCaches: vi.fn(),
  },
}));

import { searchInvestments, searchExperience, searchEducation, searchProjects } from "@/lib/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { validateSearchQuery } from "@/lib/validators/search";
import type { Mock } from "vitest";

describe("search", () => {
  // Clear cache mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cache hit
    (ServerCacheInstance.get as Mock).mockReturnValue(undefined);
    (ServerCacheInstance.getSearchResults as Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshSearch as Mock).mockReturnValue(true);
  });

  describe("query validation", () => {
    it("should validate valid queries", () => {
      const result = validateSearchQuery("test query");
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe("test query");
    });

    it("should reject empty queries", () => {
      const result = validateSearchQuery("");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject overly long queries", () => {
      const longQuery = "a".repeat(101);
      const result = validateSearchQuery(longQuery);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("should sanitize special regex characters", () => {
      const result = validateSearchQuery("test.*query[abc]");
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe("test query abc");
    });

    it("should preserve Unicode letters in search queries", () => {
      const result = validateSearchQuery("こんにちは 世界");
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe("こんにちは 世界");
    });

    it("should trim Unicode queries with surrounding symbols", () => {
      const result = validateSearchQuery("###日本語###");
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe("日本語");
    });

    it("should handle queries with only special characters", () => {
      const result = validateSearchQuery("***[[[");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("special characters");
    });
  });

  describe("searchInvestments", () => {
    it("should return all investments when query is empty", async () => {
      const results = await searchInvestments("");
      expect(results).toHaveLength(2);
    });

    it("should return array for any query", async () => {
      const results = await searchInvestments("test");
      expect(Array.isArray(results)).toBe(true);
    });

    it("should return SearchResult objects with correct shape", async () => {
      const results = await searchInvestments("");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("url");
      expect(results[0]).toHaveProperty("score");
    });

    it("should have correct URL format", async () => {
      const results = await searchInvestments("");
      expect(results[0]?.url).toMatch(/^\/investments#\d+$/);
    });
  });

  describe("searchExperience", () => {
    it("should return all experiences when query is empty", async () => {
      const results = await searchExperience("");
      expect(results).toHaveLength(2);
    });

    it("should return array for any query", async () => {
      const results = await searchExperience("engineer");
      expect(Array.isArray(results)).toBe(true);
    });

    it("should return SearchResult objects with correct shape", async () => {
      const results = await searchExperience("");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("url");
    });

    it("should have correct URL format", async () => {
      const results = await searchExperience("");
      expect(results[0]?.url).toMatch(/^\/experience#\d+$/);
    });
  });

  describe("searchEducation", () => {
    it("should return all education items when query is empty", async () => {
      const results = await searchEducation("");
      expect(results).toHaveLength(2); // 1 education + 1 certification
    });

    it("should return array for any query", async () => {
      const results = await searchEducation("science");
      expect(Array.isArray(results)).toBe(true);
    });

    it("should return SearchResult objects with correct shape", async () => {
      const results = await searchEducation("");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("description");
      expect(results[0]).toHaveProperty("url");
    });

    it("should have correct URL format", async () => {
      const results = await searchEducation("");
      expect(results[0]?.url).toMatch(/^\/education#\d+$/);
    });
  });

  describe("searchProjects", () => {
    it("should return all projects when query is empty", async () => {
      const results = await searchProjects("");
      expect(results).toHaveLength(2);
    });

    it("should find projects by name", async () => {
      const results = await searchProjects("Test Project 1");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title === "Test Project 1")).toBe(true);
    });

    it("should find projects by description", async () => {
      const results = await searchProjects("React");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title === "Test Project 1")).toBe(true);
    });

    it("should find projects by tags", async () => {
      const results = await searchProjects("typescript");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title === "Test Project 1")).toBe(true);
    });

    it("should handle special 'projects' query to navigate to projects page", async () => {
      const results = await searchProjects("projects");
      expect(results.length).toBeGreaterThanOrEqual(1);
      // The first result should be the Projects page navigation
      expect(results[0]?.title).toBe("Projects");
      expect(results[0]?.url).toBe("/projects");
      expect(results[0]?.type).toBe("page");
    });

    it("should include correct URL in results", async () => {
      const results = await searchProjects("Test Project 1");
      const project1Result = results.find((r) => r.title === "Test Project 1");
      expect(project1Result?.url).toBe("https://example.com/project1");
    });

    it("should use cached results when available", async () => {
      const cachedResults = [{ id: "cached", title: "Cached Project", url: "/cached" }];
      (ServerCacheInstance.getSearchResults as Mock).mockReturnValue({
        results: cachedResults,
      });
      (ServerCacheInstance.shouldRefreshSearch as Mock).mockReturnValue(false);

      const results = await searchProjects("test");

      expect(results).toEqual(cachedResults);
      expect(ServerCacheInstance.setSearchResults).not.toHaveBeenCalled();
    });

    it("should cache search results", async () => {
      await searchProjects("react");

      expect(ServerCacheInstance.setSearchResults).toHaveBeenCalledWith(
        "projects",
        "react",
        expect.any(Array),
      );
    });
  });
});
