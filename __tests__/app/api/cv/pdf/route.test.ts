/**
 * @vitest-environment node
 */
/**
 * CV PDF API route tests
 */

import type { ReactElement } from "react";
import { NextRequest } from "next/server";

const renderToBufferMock = vi.fn<(element: ReactElement) => Promise<Buffer>>();
const mockPdfComponent = vi.fn(() => null);

const mockedLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock("@react-pdf/renderer", () => ({
  __esModule: true,
  renderToBuffer: (...args: Parameters<typeof renderToBufferMock>) => renderToBufferMock(...args),
}));

vi.mock("@/components/features/cv/CvPdfDocument", () => ({
  __esModule: true,
  default: (...args: Parameters<typeof mockPdfComponent>) => mockPdfComponent(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  __esModule: true,
  default: mockedLogger,
}));

describe("GET /api/cv/pdf", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    renderToBufferMock.mockReset();
    mockPdfComponent.mockReset();
    mockedLogger.error.mockReset();
    mockedLogger.info.mockReset();
    mockedLogger.warn.mockReset();
  });

  it("returns a PDF buffer with cache-control headers", async () => {
    // Only fake Date.now() - keep other timers real for async operations
    vi.useFakeTimers({ now: new Date("2025-11-08T00:00:00Z") });

    const pdfPayload = Buffer.from("%PDF-1.4 test payload");
    renderToBufferMock.mockResolvedValueOnce(pdfPayload);

    const request = new NextRequest("https://example.com/api/cv/pdf");
    const { GET } = await import("@/app/api/cv/pdf/route");
    const response = await GET(request);

    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
    expect(renderToBufferMock.mock.calls[0]?.[0]).toBeTruthy();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="william-callahan-cv-20251108.pdf"',
    );

    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    expect(bodyBuffer.equals(pdfPayload)).toBe(true);
  });

  it("returns an error response when PDF rendering fails", async () => {
    const error = new Error("render failed");
    renderToBufferMock.mockRejectedValueOnce(error);

    const request = new NextRequest("https://example.com/api/cv/pdf");
    const { GET } = await import("@/app/api/cv/pdf/route");
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");

    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      type: expect.stringContaining("cv-pdf-rendering"),
      title: "CV PDF rendering failed",
      detail: "render failed",
      status: 500,
      instance: "/api/cv/pdf",
    });
    expect(typeof payload.correlationId).toBe("string");
    expect(response.headers.get("X-Correlation-ID")).toBe(payload.correlationId);

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("[CV PDF] Rendering failure (status: 500"),
      expect.any(String),
    );
  });
});
