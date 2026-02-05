/**
 * Tests for RAG Dynamic Retriever Module
 *
 * Verifies scope detection and search function orchestration.
 * Uses mocked search functions to avoid actual database/S3 calls.
 */

import { retrieveRelevantContent } from "@/lib/ai/rag/dynamic-retriever";

// Mock all search functions
vi.mock("@/lib/search/searchers/static-searchers", () => ({
  searchProjects: vi
    .fn()
    .mockResolvedValue([
      { title: "aVenture.vc", description: "Research platform", url: "/projects", score: 0.9 },
    ]),
  searchInvestments: vi.fn().mockResolvedValue([
    {
      title: "TechStartup",
      description: "Seed investment",
      url: "/investments#tech",
      score: 0.85,
    },
  ]),
  searchExperience: vi
    .fn()
    .mockResolvedValue([
      { title: "Acme Corp", description: "Senior Engineer", url: "/experience#acme", score: 0.8 },
    ]),
  searchEducation: vi.fn().mockResolvedValue([
    {
      title: "CFA Institute",
      description: "CFA Charterholder",
      url: "/education#cfa",
      score: 0.95,
    },
  ]),
}));

vi.mock("@/lib/blog/server-search", () => ({
  searchBlogPostsServerSide: vi.fn().mockResolvedValue([
    {
      title: "Building Terminal UIs",
      description: "How to build",
      url: "/blog/terminal",
      score: 0.88,
    },
  ]),
}));

vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBooks: vi
    .fn()
    .mockResolvedValue([
      { title: "Clean Code", description: "Robert Martin", url: "/books/clean-code", score: 0.75 },
    ]),
  searchBookmarks: vi.fn().mockResolvedValue([
    {
      title: "Useful Resource",
      description: "A bookmark",
      url: "/bookmarks/resource",
      score: 0.7,
    },
  ]),
}));

vi.mock("@/lib/search/searchers/tag-search", () => ({
  searchTags: vi.fn().mockResolvedValue([
    {
      title: "[Blog] > [Tags] > TypeScript",
      description: "12 posts",
      url: "/blog/tags/typescript",
      score: 0.9,
    },
  ]),
}));

vi.mock("@/lib/search/searchers/ai-analysis-searcher", () => ({
  searchAiAnalysis: vi.fn().mockResolvedValue([
    {
      title: "[Books] > Clean Code > Summary",
      description: "AI-generated summary",
      url: "/books/clean-code#analysis",
      score: 0.3,
    },
  ]),
}));

vi.mock("@/lib/search/searchers/thoughts-search", () => ({
  searchThoughts: vi.fn().mockResolvedValue([
    {
      title: "Thoughts",
      description: "Notes & ruminations",
      url: "/thoughts",
      score: 0.2,
    },
  ]),
}));

describe("RAG Dynamic Retriever", () => {
  afterAll(() => {
    vi.doUnmock("@/lib/search/searchers/static-searchers");
    vi.doUnmock("@/lib/blog/server-search");
    vi.doUnmock("@/lib/search/searchers/dynamic-searchers");
    vi.doUnmock("@/lib/search/searchers/tag-search");
    vi.doUnmock("@/lib/search/searchers/ai-analysis-searcher");
    vi.doUnmock("@/lib/search/searchers/thoughts-search");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scope detection", () => {
    it("detects projects scope", async () => {
      const { results, status } = await retrieveRelevantContent("What projects has William built?");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "projects")).toBe(true);
    });

    it("detects blog scope", async () => {
      const { results, status } = await retrieveRelevantContent("Show me blog articles");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "blog")).toBe(true);
    });

    it("detects investments scope", async () => {
      const { results, status } = await retrieveRelevantContent(
        "What startups did William invest in?",
      );

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "investments")).toBe(true);
    });

    it("detects experience scope", async () => {
      const { results, status } = await retrieveRelevantContent("Tell me about work experience");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "experience")).toBe(true);
    });

    it("detects education scope", async () => {
      const { results, status } = await retrieveRelevantContent(
        "What certifications does William have? CFA?",
      );

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "education")).toBe(true);
    });

    it("detects books scope", async () => {
      const { results, status } = await retrieveRelevantContent(
        "What books has William been reading?",
      );

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "books")).toBe(true);
    });

    it("detects bookmarks scope", async () => {
      const { results, status } = await retrieveRelevantContent("Show me bookmarked links");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "bookmarks")).toBe(true);
    });

    it("detects tags scope", async () => {
      const { results, status } = await retrieveRelevantContent(
        "What topics does William write about?",
      );

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "tags")).toBe(true);
    });

    it("detects thoughts scope", async () => {
      const { results, status } = await retrieveRelevantContent("Share your thoughts");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "thoughts")).toBe(true);
    });

    it("detects multiple scopes", async () => {
      const { results, status } = await retrieveRelevantContent(
        "What projects did William build and invest in?",
      );

      expect(status).toBe("success");
      const scopes = new Set(results.map((r) => r.scope));
      expect(scopes.size).toBeGreaterThanOrEqual(2);
    });

    it("falls back to default scopes when no keywords match", async () => {
      const { results, status } = await retrieveRelevantContent("Hello, how are you?");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.scope === "projects")).toBe(true);
    });
  });

  describe("result format", () => {
    it("includes required fields in results", async () => {
      const { results, status } = await retrieveRelevantContent("What projects exist?");

      expect(status).toBe("success");
      expect(results.length).toBeGreaterThan(0);
      const result = results[0];

      expect(result).toHaveProperty("scope");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("score");
    });

    it("results are sorted by score descending", async () => {
      const { results, status } = await retrieveRelevantContent("projects and investments");

      expect(status).toBe("success");
      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }
      }
    });

    it("includes status metadata in response", async () => {
      const response = await retrieveRelevantContent("What projects exist?");

      expect(response).toHaveProperty("results");
      expect(response).toHaveProperty("status");
      expect(["success", "partial", "failed"]).toContain(response.status);
    });
  });

  describe("options", () => {
    it("respects maxResults option", async () => {
      const { results, status } = await retrieveRelevantContent(
        "projects investments experience education",
        {
          maxResults: 2,
        },
      );

      expect(status).toBe("success");
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
