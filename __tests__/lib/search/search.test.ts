// Jest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import { searchPosts, searchInvestments, searchExperience, searchEducation, searchProjects } from "@/lib/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { validateSearchQuery } from "@/lib/validators/search";

// Mock the imported data modules using mock.module
jest.mock("@/data/blog/posts", () => ({
  posts: [
    {
      id: "1",
      title: "Test Post 1",
      slug: "test-post-1",
      excerpt: "This is a test post about React",
      content: { compiledSource: "compiled_react_content", scope: {}, frontmatter: {} },
      publishedAt: "2024-01-01T00:00:00Z",
      author: { id: "1", name: "John Doe" },
      tags: ["react", "javascript"],
    },
    {
      id: "2",
      title: "Test Post 2",
      slug: "test-post-2",
      excerpt: "This is a test post about TypeScript",
      content: { compiledSource: "compiled_typescript_content", scope: {}, frontmatter: {} },
      publishedAt: "2024-01-02T00:00:00Z",
      author: { id: "1", name: "John Doe" },
      tags: ["typescript", "javascript"],
    },
  ],
}));

jest.mock("@/data/investments", () => ({
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

jest.mock("@/data/experience", () => ({
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

jest.mock("@/data/education", () => ({
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

jest.mock("@/data/projects", () => ({
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

// Mock ServerCacheInstance
jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: jest.fn(),
    set: jest.fn(),
    getSearchResults: jest.fn(),
    setSearchResults: jest.fn(),
    shouldRefreshSearch: jest.fn(),
    clearAllCaches: jest.fn(),
  },
}));

describe("search", () => {
  // Clear cache mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cache hit
    (ServerCacheInstance.get as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.getSearchResults as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshSearch as jest.Mock).mockReturnValue(true);
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

    it("should handle queries with only special characters", () => {
      const result = validateSearchQuery("***[[[");
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("special characters");
    });
  });
  describe("searchPosts", () => {
    it("should return all posts when query is empty", async () => {
      const results = await searchPosts("");
      expect(results).toHaveLength(2);
    });

    it("should use cached results when available", async () => {
      const cachedResults = [{ id: "cached", title: "Cached Post", slug: "cached-post" }];
      (ServerCacheInstance.getSearchResults as jest.Mock).mockReturnValue({
        results: cachedResults,
      });
      (ServerCacheInstance.shouldRefreshSearch as jest.Mock).mockReturnValue(false);

      const results = await searchPosts("test");

      expect(results).toEqual(cachedResults);
      expect(ServerCacheInstance.setSearchResults).not.toHaveBeenCalled();
    });

    it("should cache search results", async () => {
      await searchPosts("react");

      expect(ServerCacheInstance.setSearchResults).toHaveBeenCalledWith(
        "posts",
        "react",
        expect.arrayContaining([expect.objectContaining({ title: "Test Post 1" })]),
      );
    });

    it("should find posts by title", async () => {
      const results = await searchPosts("Test Post 1");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Test Post 1");
    });

    it("should find posts by content", async () => {
      const results = await searchPosts("react");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.excerpt).toContain("React");
    });

    it("should find posts by tags", async () => {
      const results = await searchPosts("javascript");
      expect(results).toHaveLength(2);
    });

    it("should find posts by author", async () => {
      const results = await searchPosts("John Doe");
      expect(results).toHaveLength(2);
    });

    it("should handle multi-word search", async () => {
      const results = await searchPosts("test typescript");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Test Post 2");
    });

    it("should be case insensitive", async () => {
      const results = await searchPosts("REACT");
      expect(results).toHaveLength(1);
    });

    it("should return empty array when no matches", async () => {
      const results = await searchPosts("nonexistent");
      expect(results).toHaveLength(0);
    });

    it("should sort by publishedAt in descending order", async () => {
      const results = await searchPosts("test");
      expect(results?.[0]?.publishedAt).toBe("2024-01-02T00:00:00Z");
      expect(results?.[1]?.publishedAt).toBe("2024-01-01T00:00:00Z");
    });

    it("should handle fuzzy search with typos", async () => {
      // Test fuzzy search capability
      // Note: In tests, MiniSearch is not initialized, so it falls back to substring search
      // "react" without typo should work
      const results = await searchPosts("react");
      expect(results).toHaveLength(1);

      // With significant typo that won't match in substring search
      // (MiniSearch with fuzzy search would handle this)
      const typoResults = await searchPosts("raect"); // transposed letters
      expect(typoResults).toHaveLength(0);
    });

    it("should sanitize dangerous query patterns", async () => {
      // Just search for "test" which exists in both posts
      const results = await searchPosts("test");
      expect(results).toHaveLength(2);

      // Search with special characters should still find results after sanitization
      const resultsWithSpecialChars = await searchPosts("test.*");
      // "test.*" becomes "test  " which should still match "test"
      expect(resultsWithSpecialChars.length).toBeGreaterThan(0);
    });
  });

  describe("searchInvestments", () => {
    it("should return all investments when query is empty", async () => {
      const results = await searchInvestments("");
      expect(results).toHaveLength(2);
    });

    it("should find investments by name", async () => {
      const results = await searchInvestments("fintech startup");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Test Company 1");
    });

    it("should find exact investment matches", async () => {
      const results = await searchInvestments("Test Company 1 fintech");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Test Company 1");

      const results2 = await searchInvestments("Test Company 2 AI");
      expect(results2).toHaveLength(1);
      expect(results2?.[0]?.title).toBe("Test Company 2");
    });

    it("should find investments by description", async () => {
      const results = await searchInvestments("fintech");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toContain("fintech");
    });

    it("should find investments by type and status", async () => {
      const results = await searchInvestments("Seed Active");
      expect(results).toHaveLength(1);
    });

    it("should include correct path in results", async () => {
      const results = await searchInvestments("Test Company 1");
      expect(results?.[0]?.url).toBe("/investments#1");
    });
  });

  describe("searchExperience", () => {
    it("should return all experiences when query is empty", async () => {
      const results = await searchExperience("");
      expect(results).toHaveLength(2);
    });

    it("should find experiences by company", async () => {
      const results = await searchExperience("Tech Corp");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Tech Corp");
    });

    it("should find experiences by role", async () => {
      const results = await searchExperience("Senior Engineer");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe("Senior Engineer");
    });

    it("should find experiences by period", async () => {
      const results = await searchExperience("2022");
      expect(results).toHaveLength(2);
    });

    it("should include correct path in results", async () => {
      const results = await searchExperience("Tech Corp");
      expect(results?.[0]?.url).toBe("/experience#1");
    });
  });

  describe("searchEducation", () => {
    it("should return all education items when query is empty", async () => {
      const results = await searchEducation("");
      expect(results).toHaveLength(2); // 1 education + 1 certification
    });

    it("should find education by institution", async () => {
      const results = await searchEducation("Test University");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.title).toBe("Test University");
    });

    it("should find education by degree", async () => {
      const results = await searchEducation("Computer Science");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe("Computer Science");
    });

    it("should find certifications by name", async () => {
      const results = await searchEducation("Advanced Programming");
      expect(results).toHaveLength(1);
      expect(results?.[0]?.description).toBe("Advanced Programming");
    });

    it("should include correct path in results", async () => {
      const results = await searchEducation("Test University");
      expect(results?.[0]?.url).toBe("/education#1");
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
      expect(results.some(r => r.title === "Test Project 1")).toBe(true);
    });

    it("should find projects by description", async () => {
      const results = await searchProjects("React");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title === "Test Project 1")).toBe(true);
    });

    it("should find projects by tags", async () => {
      const results = await searchProjects("typescript");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title === "Test Project 1")).toBe(true);
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
      const project1Result = results.find(r => r.title === "Test Project 1");
      expect(project1Result?.url).toBe("https://example.com/project1");
    });

    it("should use cached results when available", async () => {
      const cachedResults = [{ id: "cached", title: "Cached Project", url: "/cached" }];
      (ServerCacheInstance.getSearchResults as jest.Mock).mockReturnValue({
        results: cachedResults,
      });
      (ServerCacheInstance.shouldRefreshSearch as jest.Mock).mockReturnValue(false);

      const results = await searchProjects("test");

      expect(results).toEqual(cachedResults);
      expect(ServerCacheInstance.setSearchResults).not.toHaveBeenCalled();
    });

    it("should cache search results", async () => {
      await searchProjects("react");

      expect(ServerCacheInstance.setSearchResults).toHaveBeenCalledWith("projects", "react", expect.any(Array));
    });
  });
});
