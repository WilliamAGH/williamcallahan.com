/**
 * @fileoverview Tests for getBaseUrl utility function that determines the application's base URL
 * @module __tests__/lib/getBaseUrl.test
 * @jest-environment node
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
    process.env = { ...ORIGINAL_ENV }; // clone
  });

  /**
   * Restore original environment after all tests complete
   */
  afterAll(() => {
    process.env = { ...ORIGINAL_ENV }; // restore from snapshot
  });

  /**
   * Verifies API_BASE_URL takes precedence over other environment variables
   */
  it("prefers API_BASE_URL when defined", async () => {
    process.env.API_BASE_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.com";
    const { getBaseUrl } = await import("@/lib/getBaseUrl");
    const result = getBaseUrl();
    expect(result).toBe("https://api.example.com");
  });

  /**
   * Verifies fallback to NEXT_PUBLIC_SITE_URL and trailing slash removal
   */
  it("falls back to NEXT_PUBLIC_SITE_URL if API_BASE_URL not set", async () => {
    process.env.API_BASE_URL = undefined;
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.com/"; // with trailing slash
    const { getBaseUrl } = await import("@/lib/getBaseUrl");
    const result = getBaseUrl();
    expect(result).toBe("https://public.example.com"); // trailing slash removed
  });

  /**
   * Verifies localhost fallback with custom PORT environment variable
   */
  it("defaults to localhost with provided PORT", async () => {
    process.env.API_BASE_URL = undefined;
    process.env.NEXT_PUBLIC_SITE_URL = undefined;
    process.env.PORT = "4567";
    const { getBaseUrl } = await import("@/lib/getBaseUrl");
    const result = getBaseUrl();
    expect(result).toBe("http://localhost:4567");
  });
}); 