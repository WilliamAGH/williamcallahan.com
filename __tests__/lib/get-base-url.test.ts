/**
 * @fileoverview Tests for getBaseUrl utility function that determines the application's base URL
 * @module __tests__/lib/getBaseUrl.test
 * @vitest-environment node
 */

/**
 * Test suite for getBaseUrl function
 */
describe("getBaseUrl", () => {
  /** Store original environment variables for restoration after tests */
  const ORIGINAL_ENV = { ...process.env };

  /**
   * Clone environment before each test
   */
  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV }; // clone
  });

  /**
   * Restore original environment after all tests complete
   */
  afterAll(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV }; // restore from snapshot
  });

  /**
   * Verifies API_BASE_URL takes precedence over other environment variables
   */
  it("prefers API_BASE_URL when defined", async () => {
    process.env.API_BASE_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.com";
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const result = getBaseUrl();
    expect(result).toBe("https://api.example.com");
  });

  it("trims API_BASE_URL whitespace and trailing slashes", async () => {
    process.env.API_BASE_URL = " https://api.example.com/ ";
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const result = getBaseUrl();
    expect(result).toBe("https://api.example.com");
  });

  /**
   * Verifies fallback to NEXT_PUBLIC_SITE_URL and trailing slash removal
   */
  it("falls back to NEXT_PUBLIC_SITE_URL if API_BASE_URL not set", async () => {
    process.env.API_BASE_URL = undefined;
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.com/"; // with trailing slash
    vi.stubEnv("NODE_ENV", "production"); // Set to production to use NEXT_PUBLIC_SITE_URL
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const result = getBaseUrl();
    expect(result).toBe("https://public.example.com"); // trailing slash removed
  });

  it("ignores root-relative API_BASE_URL and uses NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_BASE_URL", "/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public.example.com");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { getBaseUrl } = await import("@/lib/utils/get-base-url");

      expect(getBaseUrl()).toBe("https://public.example.com");
      expect(warnSpy).toHaveBeenCalledWith(
        "[getBaseUrl] Ignoring invalid API_BASE_URL; expected an absolute HTTP(S) URL.",
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("uses the production fallback for a root-relative NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "/");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { getBaseUrl } = await import("@/lib/utils/get-base-url");

      expect(getBaseUrl()).toBe("https://williamcallahan.com");
      expect(warnSpy).toHaveBeenCalledWith(
        "[getBaseUrl] Ignoring invalid NEXT_PUBLIC_SITE_URL; expected an absolute HTTP(S) URL.",
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  /**
   * Verifies localhost fallback with custom PORT environment variable
   */
  it("defaults to localhost with provided PORT", async () => {
    process.env.API_BASE_URL = undefined;
    process.env.NEXT_PUBLIC_SITE_URL = undefined;
    process.env.PORT = "4567";
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const result = getBaseUrl();
    expect(result).toBe("http://localhost:4567");
  });
});
