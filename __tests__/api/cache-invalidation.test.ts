/**
 * Integration test for cache invalidation via API routes
 */

import { describe, expect, it, jest, beforeAll, beforeEach } from "@jest/globals";
import { createMocks } from "node-mocks-http";
import { POST as clearCacheHandler } from "@/app/api/cache/clear/route";
import { POST as invalidateBookmarksHandler, DELETE as clearBookmarksHandler } from "@/app/api/cache/bookmarks/route";
import { NextRequest } from "next/server";


// Mock the cache library
jest.mock("@/lib/cache", () => {
  const actual = jest.requireActual<typeof import("@/lib/cache")>("@/lib/cache");
  return {
    ...actual,
    invalidateBookmarksCache: jest.fn(),
    invalidateAllCaches: jest.fn(),
  };
});

// Mock S3 utilities
jest.mock("@/lib/s3-utils", () => {
  return {
    readJsonS3: jest
      .fn<() => Promise<{ count: number; lastRefresh: string }>>()
      .mockResolvedValue({ count: 0, lastRefresh: new Date().toISOString() }),
    writeJsonS3: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
});

// Mock bookmark data access
jest.mock("@/lib/bookmarks/bookmarks-data-access.server", () => {
  return {
    invalidateBookmarksCache: jest.fn().mockReturnValue({
        success: true,
        bookmarks: [],
        count: 0,
        lastRefresh: new Date().toISOString(),
      }),
  }
});

// Mock refresh function
jest.mock("@/lib/bookmarks", () => {
  return {
    refreshBookmarksData: jest
      .fn<() => Promise<{ status: string; phases: any }>>()
      .mockResolvedValue({
        status: "COMPLETE_SUCCESS",
        phases: {
          primaryFetch: { status: "SUCCESS", recordCount: 10 },
          s3Fallback: { status: "NOT_ATTEMPTED" },
          finalOutcome: { status: "PRIMARY_SUCCESS", bookmarksServed: 10 },
        },
      }),
  }
});

// Mock DataFetchManager
jest.mock("@/lib/server/data-fetch-manager", () => {
  class MockDataFetchManager {
    fetchData = jest.fn<() => Promise<Array<{ operation: string; success: boolean; dataCount: number }>>>().mockResolvedValue([
      { operation: "bookmarks", success: true, dataCount: 10 },
    ]);
  }
  return { DataFetchManager: MockDataFetchManager }
});

describe("Cache Invalidation via API Routes", () => {
  beforeAll(() => {
    // Fetch polyfills are already set up in global-mocks.ts
    const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === "true";
    console.log(`Testing with USE_NEXTJS_CACHE: ${USE_NEXTJS_CACHE}`);
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe.skip("GitHub Activity Refresh API", () => {
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
      const response = await clearCacheHandler(req as any);
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
