const mockCacheTag = vi.fn();
const mockCacheLife = vi.fn();
const mockRevalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

import {
  CACHE_TTL,
  cacheContextGuards,
  getCacheProfile,
  withCacheFallback,
  USE_NEXTJS_CACHE,
} from "@/lib/cache";

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
