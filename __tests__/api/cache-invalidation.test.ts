/**
 * Integration test for cache invalidation via API routes
 */

import { vi } from "vitest";
import { createMocks } from "node-mocks-http";
import { POST as clearCacheHandler } from "@/app/api/cache/clear/route";
import {
  POST as invalidateBookmarksHandler,
  DELETE as clearBookmarksHandler,
} from "@/app/api/cache/bookmarks/route";
import { NextRequest } from "next/server";

// Mock the cache library
vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    invalidateBookmarksCache: vi.fn(),
    invalidateAllCaches: vi.fn(),
  };
});

// Mock server-cache
vi.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    shouldRefreshBookmarks: vi.fn().mockReturnValue(true),
    clearBookmarks: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      keys: 0,
      hits: 0,
      misses: 0,
      sizeBytes: 0,
      maxSizeBytes: 0,
      utilizationPercent: 0,
    }),
  },
  getDeterministicTimestamp: vi.fn(() => Date.now()),
}));

// Mock S3 utilities
vi.mock("@/lib/s3/json", () => {
  return {
    readJsonS3Optional: vi
      .fn()
      .mockResolvedValue({ count: 0, lastRefresh: new Date().toISOString() }),
    writeJsonS3: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock bookmark data access
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => {
  return {
    invalidateBookmarksCache: vi.fn().mockReturnValue({
      success: true,
      bookmarks: [],
      count: 0,
      lastRefresh: new Date().toISOString(),
    }),
  };
});

// Mock refresh function
vi.mock("@/lib/bookmarks", () => {
  return {
    refreshBookmarksData: vi.fn().mockResolvedValue({
      status: "COMPLETE_SUCCESS",
      phases: {
        primaryFetch: { status: "SUCCESS", recordCount: 10 },
        s3Fallback: { status: "NOT_ATTEMPTED" },
        finalOutcome: { status: "PRIMARY_SUCCESS", bookmarksServed: 10 },
      },
    }),
  };
});

// Mock DataFetchManager
vi.mock("@/lib/server/data-fetch-manager", () => {
  class MockDataFetchManager {
    fetchData = vi
      .fn()
      .mockResolvedValue([{ operation: "bookmarks", success: true, dataCount: 10 }]);
  }
  return { DataFetchManager: MockDataFetchManager };
});

describe("Cache Invalidation via API Routes", () => {
  beforeAll(() => {
    // Fetch polyfills are already set up in global-mocks.ts
    const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === "true";
    console.log(`Testing with USE_NEXTJS_CACHE: ${USE_NEXTJS_CACHE}`);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Bookmarks Cache API", () => {
    it("should invalidate bookmarks cache via POST request", async () => {
      // Set up environment for test
      const originalApiKey = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = "test-api-key";

      const { req } = createMocks({
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-key",
        },
      });

      // Call the handler
      const response = await invalidateBookmarksHandler(req);
      const data = await response.json();

      // Log error if status is not 200
      if (response.status !== 200) {
        console.error("Response error:", data);
      }

      // Verify response
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "success");
      expect(data).toHaveProperty("message");
      expect(data.message).toContain("Bookmarks refreshed successfully");

      // Restore environment
      process.env.ADMIN_API_KEY = originalApiKey;
    });

    it("should clear bookmarks cache via DELETE request", async () => {
      // Set up environment for test
      const originalApiKey = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = "test-api-key";

      const { req } = createMocks({
        method: "DELETE",
        headers: {
          Authorization: "Bearer test-api-key",
        },
      });

      // Call the handler
      const response = clearBookmarksHandler(req);
      const data = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "success");
      expect(data).toHaveProperty("message");
      expect(data.message).toContain("Bookmarks cache metadata cleared successfully");

      // Restore environment
      process.env.ADMIN_API_KEY = originalApiKey;
    });
  });

  describe("GitHub Activity Refresh API", () => {
    it("should handle refresh request without secret", async () => {
      // Import the route handler
      const { POST } = await import("@/app/api/github-activity/refresh/route");

      // Create a mock request without secret
      const request = new NextRequest("http://localhost:3000/api/github-activity/refresh", {
        method: "POST",
      });

      // Call the handler
      const response = await POST(request);
      const data = await response.json();

      // Should fail without secret
      expect(response.status).toBe(401);
      expect(data).toHaveProperty("code", "UNAUTHORIZED_REFRESH_SECRET");
    });

    it("should skip refresh during build phase", async () => {
      // Temporarily set build phase
      const originalPhase = process.env.NEXT_PHASE;
      process.env.NEXT_PHASE = "phase-production-build";

      // Import the route handler
      const { POST } = await import("@/app/api/github-activity/refresh/route");

      // Create a mock request
      const request = new NextRequest("http://localhost:3000/api/github-activity/refresh", {
        method: "POST",
      });

      // Call the handler
      const response = await POST(request);
      const data = await response.json();

      // Should skip during build
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("buildPhase", true);

      // Restore original phase
      process.env.NEXT_PHASE = originalPhase;
    });
  });

  describe("Cache Clear API", () => {
    it("should clear all caches via POST request", async () => {
      // Set up environment for test
      const originalApiKey = process.env.CACHE_API_KEY;
      process.env.CACHE_API_KEY = "test-cache-api-key";

      const { req } = createMocks({
        method: "POST",
        headers: {
          "x-api-key": "test-cache-api-key",
        },
      });

      // Call the handler
      const response = await Promise.resolve(clearCacheHandler(req as any));
      const data = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "success");
      expect(data).toHaveProperty("message", "All Next.js caches cleared successfully");

      // Restore environment
      process.env.CACHE_API_KEY = originalApiKey;
    });
  });
});
