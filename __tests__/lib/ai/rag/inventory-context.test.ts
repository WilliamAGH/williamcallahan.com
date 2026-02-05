/**
 * Tests for RAG Inventory Context Builder
 * @vitest-environment node
 */

import { buildInventoryContext } from "@/lib/ai/rag/inventory-context";
import type { BookmarkIndexItem } from "@/types/schemas/search";

vi.mock("@/data/investments", () => ({
  investments: [
    {
      id: "alpha",
      name: "Alpha",
      description: "Test",
      type: "Direct",
      stage: "Seed",
      invested_year: "2024",
      status: "Active",
      operating_status: "Operating",
      multiple: 1,
      holding_return: 0,
    },
  ],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/projects", () => ({
  projects: [
    {
      id: "project-1",
      name: "Project One",
      description: "Test",
      url: "/projects",
      tags: ["AI"],
      cvFeatured: true,
    },
  ],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/experience", () => ({
  experiences: [
    {
      id: "exp-1",
      company: "Company",
      role: "Role",
      period: "2020-2021",
      startDate: "2020-01-01",
      endDate: "2021-01-01",
      location: "NYC",
    },
  ],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/education", () => ({
  education: [
    {
      id: "edu-1",
      institution: "School",
      degree: "Degree",
      year: 2020,
      location: "NYC",
      cvFeatured: true,
    },
  ],
  certifications: [
    {
      id: "cert-1",
      institution: "Org",
      name: "Certification",
      year: 2021,
      location: "NYC",
      cvFeatured: true,
    },
  ],
  recentCourses: [
    {
      id: "course-1",
      institution: "School",
      name: "Course",
      year: 2022,
      location: "NYC",
      cvFeatured: true,
    },
  ],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/metadata", () => ({
  PAGE_METADATA: {
    thoughts: { title: "Thoughts" },
  },
}));

vi.mock("@/lib/blog/mdx", () => ({
  getAllMDXPostsForSearch: vi.fn().mockResolvedValue([
    {
      slug: "post-1",
      title: "Post One",
      publishedAt: "2024-01-01",
      tags: ["ai"],
    },
  ]),
}));

vi.mock("@/lib/search/loaders/dynamic-content", async () => {
  const { default: MiniSearch } = await import("minisearch");
  const emptyBookmarksIndex = new MiniSearch<BookmarkIndexItem>({
    fields: ["title", "description", "tags", "summary", "author", "publisher", "url", "slug"],
    storeFields: ["id", "title", "tags", "url", "slug"],
  });

  return {
    getBookmarksIndex: vi.fn().mockResolvedValue({
      index: emptyBookmarksIndex,
      bookmarks: [
        {
          id: "bookmark-1",
          slug: "bookmark-1",
          title: "Bookmark One",
          url: "https://example.com",
          tags: "ai\nsearch",
        },
      ],
    }),
    getCachedBooksData: vi.fn().mockResolvedValue([
      {
        id: "book-1",
        title: "Book One",
        authors: ["Author"],
        publishedYear: "2020",
      },
    ]),
  };
});

vi.mock("@/lib/ai-analysis/reader.server", () => ({
  listAnalysisItemIds: vi.fn((domain: string) => {
    if (domain === "bookmarks") return Promise.resolve(["bookmark-1"]);
    if (domain === "books") return Promise.resolve(["book-1"]);
    return Promise.resolve(["project-1"]);
  }),
}));

describe("RAG Inventory Context", () => {
  it("includes static and dynamic sections", async () => {
    const result = await buildInventoryContext({ includeDynamic: true, skipCache: true });

    expect(result.text).toContain("INVENTORY CATALOG");
    expect(result.text).toContain("Investments");
    expect(result.text).toContain("Bookmarks");
    expect(result.text).toContain("AI Analysis");
  });

  it("returns section summaries", async () => {
    const result = await buildInventoryContext({ includeDynamic: true, skipCache: true });

    const sectionNames = result.sections.map((section) => section.name);
    expect(sectionNames).toContain("investments");
    expect(sectionNames).toContain("books");
  });
});

afterAll(() => {
  vi.doUnmock("@/data/investments");
  vi.doUnmock("@/data/projects");
  vi.doUnmock("@/data/experience");
  vi.doUnmock("@/data/education");
  vi.doUnmock("@/data/metadata");
  vi.doUnmock("@/lib/blog/mdx");
  vi.doUnmock("@/lib/search/loaders/dynamic-content");
  vi.doUnmock("@/lib/ai-analysis/reader.server");
  vi.resetModules();
});
