const mockCacheTag = vi.fn();
const mockCacheLife = vi.fn();
const mockRevalidateTag = vi.fn();
const mockPersistAnalysisToDb = vi.fn();
const mockReadLatestAnalysis = vi.fn();
const mockHasAnalysisInDb = vi.fn();

vi.mock("next/cache", () => ({
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@/lib/db/mutations/ai-analysis", () => ({
  persistAnalysisToDb: (...args: unknown[]) => mockPersistAnalysisToDb(...args),
}));

vi.mock("@/lib/db/queries/ai-analysis", () => ({
  readLatestAnalysis: (...args: unknown[]) => mockReadLatestAnalysis(...args),
  hasAnalysisInDb: (...args: unknown[]) => mockHasAnalysisInDb(...args),
  listAnalysisItemIdsFromDb: vi.fn(),
  listAnalysisVersionsFromDb: vi.fn(),
}));

import {
  CACHE_TTL,
  cacheContextGuards,
  getCacheProfile,
  withCacheFallback,
  USE_NEXTJS_CACHE,
} from "@/lib/cache";
import { getCachedAnalysis, hasCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import { persistAnalysis as persistServerAnalysis } from "@/lib/ai-analysis/writer.server";

describe("lib/cache", () => {
  describe("CACHE_TTL constants", () => {
    it("should have correct CACHE_TTL constants", () => {
      expect(CACHE_TTL.DEFAULT).toBe(30 * 24 * 60 * 60);
      expect(CACHE_TTL.DAILY).toBe(24 * 60 * 60);
      expect(CACHE_TTL.HOURLY).toBe(60 * 60);
    });
  });

  describe("getCacheProfile", () => {
    it("should return 'minutes' for TTL <= 60 seconds", () => {
      expect(getCacheProfile(30)).toBe("minutes");
      expect(getCacheProfile(60)).toBe("minutes");
    });

    it("should return 'hours' for TTL <= 3600 seconds", () => {
      expect(getCacheProfile(61)).toBe("hours");
      expect(getCacheProfile(3600)).toBe("hours");
    });

    it("should return 'days' for TTL <= 86400 seconds", () => {
      expect(getCacheProfile(3601)).toBe("days");
      expect(getCacheProfile(86400)).toBe("days");
    });

    it("should return 'weeks' for TTL > 86400 seconds", () => {
      expect(getCacheProfile(86401)).toBe("weeks");
      expect(getCacheProfile(604800)).toBe("weeks");
    });
  });

  describe("withCacheFallback", () => {
    it("should return cached result when cache function succeeds", async () => {
      const cachedFn = vi.fn().mockResolvedValue("cached result");
      const fallbackFn = vi.fn().mockResolvedValue("fallback result");

      const result = await withCacheFallback(cachedFn, fallbackFn);

      expect(result).toBe("cached result");
      expect(cachedFn).toHaveBeenCalled();
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it("should return fallback result when cache function fails", async () => {
      const cachedFn = vi.fn().mockRejectedValue(new Error("Cache error"));
      const fallbackFn = vi.fn().mockResolvedValue("fallback result");

      const result = await withCacheFallback(cachedFn, fallbackFn);

      expect(result).toBe("fallback result");
      expect(cachedFn).toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalled();
    });

    it("keeps cached functions active during production build so cache tags register", async () => {
      const previousPhase = process.env.NEXT_PHASE;
      process.env.NEXT_PHASE = "phase-production-build";
      mockCacheTag.mockClear();
      mockCacheLife.mockClear();
      const cachedFn = vi.fn(async () => {
        cacheContextGuards.cacheTag("BuildCache", "build-tag");
        cacheContextGuards.cacheLife("BuildCache", { revalidate: 120 });
        return "cached result";
      });
      const fallbackFn = vi.fn().mockResolvedValue("fallback result");

      try {
        const result = await withCacheFallback(cachedFn, fallbackFn);

        expect(result).toBe("cached result");
        expect(cachedFn).toHaveBeenCalled();
        expect(fallbackFn).not.toHaveBeenCalled();
        expect(mockCacheTag).toHaveBeenCalledWith("build-tag");
        expect(mockCacheLife).toHaveBeenCalledWith({ revalidate: 120 });
      } finally {
        if (previousPhase === undefined) {
          delete process.env.NEXT_PHASE;
        } else {
          process.env.NEXT_PHASE = previousPhase;
        }
      }
    });
  });

  describe("USE_NEXTJS_CACHE", () => {
    it("should be a boolean", () => {
      expect(typeof USE_NEXTJS_CACHE).toBe("boolean");
    });
  });

  describe("cacheContextGuards during production build", () => {
    it("forwards cacheTag and cacheLife so prerendered entries stay invalidatable by revalidateTag", () => {
      const previousPhase = process.env.NEXT_PHASE;
      process.env.NEXT_PHASE = "phase-production-build";
      mockCacheTag.mockClear();
      mockCacheLife.mockClear();

      try {
        cacheContextGuards.cacheTag("AiAnalysis", "ai-analysis-bookmarks-abc");
        cacheContextGuards.cacheLife("AiAnalysis", { revalidate: 86400 });

        expect(mockCacheTag).toHaveBeenCalledWith("ai-analysis-bookmarks-abc");
        expect(mockCacheLife).toHaveBeenCalledWith({ revalidate: 86400 });
      } finally {
        if (previousPhase === undefined) {
          delete process.env.NEXT_PHASE;
        } else {
          process.env.NEXT_PHASE = previousPhase;
        }
      }
    });

    it("expires tags immediately for read-your-writes cache refreshes", () => {
      mockRevalidateTag.mockClear();

      cacheContextGuards.expireTag("AiAnalysis", "ai-analysis-bookmarks-abc");

      expect(mockRevalidateTag).toHaveBeenCalledWith("ai-analysis-bookmarks-abc", { expire: 0 });
    });
  });

  describe("AI analysis cache persistence", () => {
    const cachedAnalysis = {
      metadata: { generatedAt: "2026-07-03T00:00:00.000Z", modelVersion: "v1" },
      analysis: {
        summary: "Persisted forever.",
        category: "Technology",
        highlights: ["Stored in PostgreSQL."],
        contextualDetails: {
          primaryDomain: "Programming",
          format: "Article",
          accessMethod: "Free",
        },
        relatedResources: [],
        targetAudience: "Developers",
      },
    };

    beforeEach(() => {
      mockCacheLife.mockClear();
      mockCacheTag.mockClear();
      mockRevalidateTag.mockClear();
      mockPersistAnalysisToDb.mockReset();
      mockReadLatestAnalysis.mockReset();
      mockHasAnalysisInDb.mockReset();
    });

    it("keeps persisted analysis cached with a non-expiring profile", async () => {
      mockReadLatestAnalysis.mockResolvedValue(cachedAnalysis);

      await expect(getCachedAnalysis("bookmarks", "bookmark-1")).resolves.toBe(cachedAnalysis);

      expect(mockCacheTag).toHaveBeenCalledWith("ai-analysis-bookmarks-bookmark-1");
      expect(mockCacheLife).toHaveBeenCalledWith("max");
    });

    it("keeps missing analysis cache entries short lived", async () => {
      mockReadLatestAnalysis.mockResolvedValue(null);

      await expect(getCachedAnalysis("bookmarks", "bookmark-1")).resolves.toBeNull();

      expect(mockCacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 1 });
    });

    it("uses matching existence cache lifetimes for cached-analysis probes", async () => {
      mockHasAnalysisInDb.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(hasCachedAnalysis("bookmarks", "bookmark-1")).resolves.toBe(true);
      await expect(hasCachedAnalysis("bookmarks", "bookmark-2")).resolves.toBe(false);

      expect(mockCacheLife).toHaveBeenNthCalledWith(1, "max");
      expect(mockCacheLife).toHaveBeenNthCalledWith(2, { stale: 0, revalidate: 1, expire: 1 });
    });

    it("immediately expires analysis cache tags after a successful database write", async () => {
      mockPersistAnalysisToDb.mockResolvedValue(undefined);

      await persistServerAnalysis("bookmarks", "bookmark-1", cachedAnalysis.analysis);

      expect(mockRevalidateTag).toHaveBeenCalledWith("ai-analysis", { expire: 0 });
      expect(mockRevalidateTag).toHaveBeenCalledWith("ai-analysis-bookmarks", { expire: 0 });
      expect(mockRevalidateTag).toHaveBeenCalledWith("ai-analysis-bookmarks-bookmark-1", {
        expire: 0,
      });
      expect(mockRevalidateTag).toHaveBeenCalledWith("ai-analysis-versions-bookmarks-bookmark-1", {
        expire: 0,
      });
    });
  });

  describe("cacheContextGuards in scheduler CLI processes", () => {
    it("skips Next.js cache APIs for scheduler script entrypoints", () => {
      const previousArgv = [...process.argv];
      const nodePath = previousArgv[0];
      if (!nodePath) {
        throw new Error("Expected process.argv[0] to be set");
      }
      process.argv = [nodePath, "/app/scheduler/submit-sitemap.ts"];
      mockCacheTag.mockClear();
      mockCacheLife.mockClear();
      mockRevalidateTag.mockClear();

      try {
        cacheContextGuards.cacheTag("BookmarksDataAccess", "bookmarks");
        cacheContextGuards.cacheLife("BookmarksDataAccess", { revalidate: 120 });
        cacheContextGuards.revalidateTag("BookmarksDataAccess", "bookmarks");
        cacheContextGuards.expireTag("BookmarksDataAccess", "bookmarks");

        expect(mockCacheTag).not.toHaveBeenCalled();
        expect(mockCacheLife).not.toHaveBeenCalled();
        expect(mockRevalidateTag).not.toHaveBeenCalled();
      } finally {
        process.argv = previousArgv;
      }
    });

    it("uses the fallback function for package-script data updater runs", async () => {
      const previousArgv = [...process.argv];
      const nodePath = previousArgv[0];
      if (!nodePath) {
        throw new Error("Expected process.argv[0] to be set");
      }
      process.argv = [nodePath, "/app/node_modules/.bin/tsx", "scheduler/data-updater.ts"];
      const cachedFn = vi.fn().mockResolvedValue("cached result");
      const fallbackFn = vi.fn().mockResolvedValue("fallback result");

      try {
        const result = await withCacheFallback(cachedFn, fallbackFn);

        expect(result).toBe("fallback result");
        expect(cachedFn).not.toHaveBeenCalled();
        expect(fallbackFn).toHaveBeenCalled();
      } finally {
        process.argv = previousArgv;
      }
    });
  });
});
