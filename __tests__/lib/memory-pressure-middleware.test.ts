/**
 * @fileoverview Tests for memoryPressureMiddleware fail-safe behavior
 */

describe("memoryPressureMiddleware", () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
    delete process.env.MEMORY_PRESSURE_CRITICAL;
    delete process.env.MEMORY_PRESSURE_WARNING;
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
  });

  it("fails safe with 503 when health check fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Health check failed"));

    const { memoryPressureMiddleware } = await import("@/lib/middleware/memory-pressure");
    const request = {
      nextUrl: new URL("https://example.com/api/test"),
      method: "GET",
    };

    const response = await memoryPressureMiddleware(request as never);
    expect(response?.status).toBe(503);
  });
});
