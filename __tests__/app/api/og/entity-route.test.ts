/**
 * Unified OG Image Route Handler Tests
 * @module __tests__/app/api/og/entity-route.test
 * @description
 * Validates the /api/og/[entity] route: entity dispatch, param validation,
 * and error handling. Image fetching is mocked to avoid network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sharp before any imports that use it
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  })),
}));

// Mock fetch-image to avoid network calls and sharp dependency in tests
vi.mock("@/lib/og-image/fetch-image", () => ({
  fetchImageAsDataUrl: vi.fn().mockResolvedValue(null),
}));

// Mock @vercel/og to avoid actual image rendering
vi.mock("@vercel/og", () => ({
  ImageResponse: class MockImageResponse extends Response {
    constructor(element: React.ReactElement, options?: { width?: number; height?: number }) {
      super(JSON.stringify({ element: "rendered", ...options }), {
        headers: { "content-type": "image/png" },
      });
    }
  },
}));

import { GET } from "@/app/api/og/[entity]/route";

function createMockRequest(url: string) {
  const fullUrl = new URL(url, "https://williamcallahan.com");
  return {
    nextUrl: {
      searchParams: fullUrl.searchParams,
      origin: fullUrl.origin,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/og/[entity]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid entity types", async () => {
    const request = createMockRequest("/api/og/invalid");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "invalid" }),
    });
    expect(response.status).toBe(400);
  });

  it("renders books entity with title param", async () => {
    const request = createMockRequest("/api/og/books?title=Test+Book&author=John+Doe");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "books" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("renders bookmarks entity", async () => {
    const request = createMockRequest("/api/og/bookmarks?title=Cool+Bookmark&domain=example.com");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "bookmarks" }),
    });
    expect(response.status).toBe(200);
  });

  it("renders blog entity", async () => {
    const request = createMockRequest("/api/og/blog?title=My+Post&author=William&tags=AI,Next.js");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "blog" }),
    });
    expect(response.status).toBe(200);
  });

  it("renders projects entity", async () => {
    const request = createMockRequest("/api/og/projects?title=My+App&tags=TypeScript,React");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "projects" }),
    });
    expect(response.status).toBe(200);
  });

  it("renders thoughts entity", async () => {
    const request = createMockRequest("/api/og/thoughts?title=A+Thought&subtitle=Some+excerpt");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "thoughts" }),
    });
    expect(response.status).toBe(200);
  });

  it("renders collection entity", async () => {
    const request = createMockRequest(
      "/api/og/collection?title=AI+Posts&section=blog&subtitle=12+posts",
    );
    const response = await GET(request, {
      params: Promise.resolve({ entity: "collection" }),
    });
    expect(response.status).toBe(200);
  });

  it("uses default values when params are missing", async () => {
    const request = createMockRequest("/api/og/books");
    const response = await GET(request, {
      params: Promise.resolve({ entity: "books" }),
    });
    expect(response.status).toBe(200);
  });
});
