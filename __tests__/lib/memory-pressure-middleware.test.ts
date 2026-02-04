/**
 * @fileoverview Tests for memoryPressureMiddleware behavior under failed health probes
 */

describe("memoryPressureMiddleware", () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
    delete process.env.MEMORY_PRESSURE_CRITICAL;
    delete process.env.MEMORY_PRESSURE_WARNING;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = originalFetch;
  });

  it("does not make external health check calls", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Health check failed"));

    const { memoryPressureMiddleware } = await import("@/lib/middleware/memory-pressure");
    const request = {
      nextUrl: new URL("https://example.com/api/test"),
      method: "GET",
    };

    const response = await memoryPressureMiddleware(request as never);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(response).toBeNull();
  });
});
