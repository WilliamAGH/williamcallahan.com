import { NextRequest } from "next/server";
import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";

describe("memoryPressureMiddleware", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MEMORY_PRESSURE_CRITICAL;
    delete process.env.MEMORY_PRESSURE_WARNING;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("allows health checks through", async () => {
    const request = new NextRequest("https://example.com/api/health");
    const result = await memoryPressureMiddleware(request);
    expect(result).toBeNull();
  });

  it("returns 503 when env critical flag is set", async () => {
    process.env.MEMORY_PRESSURE_CRITICAL = "true";
    const request = new NextRequest("https://example.com/");
    const result = await memoryPressureMiddleware(request);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(503);
    expect(result?.headers.get("X-System-Status")).toBe("MEMORY_CRITICAL");
  });

  it("returns 503 when RSS exceeds critical utilization (override)", async () => {
    const request = new NextRequest("https://example.com/blog");
    // 950MB/1GB => 92.7% => critical
    const result = await memoryPressureMiddleware(request, {
      rssBytes: 950 * 1024 * 1024,
      limitBytes: 1024 * 1024 * 1024,
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(503);
    expect(result?.headers.get("X-System-Status")).toBe("MEMORY_CRITICAL");
  });

  it("returns NextResponse.next() with warning header when RSS exceeds warning utilization (override)", async () => {
    const request = new NextRequest("https://example.com/contact");
    // 900MB/1GB => 87.9% => warning (not critical)
    const result = await memoryPressureMiddleware(request, {
      rssBytes: 900 * 1024 * 1024,
      limitBytes: 1024 * 1024 * 1024,
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(200);
    expect(result?.headers.get("X-System-Status")).toBe("MEMORY_WARNING");
  });
});
