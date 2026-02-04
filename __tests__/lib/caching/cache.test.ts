import { CACHE_TTL, getCacheProfile, withCacheFallback, USE_NEXTJS_CACHE } from "@/lib/cache";

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
  });

  describe("USE_NEXTJS_CACHE", () => {
    it("should be a boolean", () => {
      expect(typeof USE_NEXTJS_CACHE).toBe("boolean");
    });
  });
});
