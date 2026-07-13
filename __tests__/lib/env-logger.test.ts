/**
 * @fileoverview Tests for envLogger safe stringification
 * @vitest-environment node
 */

import fs from "node:fs";
import { POST as logClientError } from "@/app/api/log-client-error/route";
import { getErrorMessage } from "@/lib/utils/error-utils";
import { apiErrorResponseSchema, clientErrorSchema } from "@/types/schemas/api";
import { NextRequest } from "next/server";

describe("envLogger", () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalLog = console.log;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      VERBOSE_TEST_LOGS: "true",
      API_BASE_URL: "https://williamcallahan.com",
    };
    vi.resetModules();
    console.log = vi.fn();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    console.log = originalLog;
  });

  it("does not throw when logging circular data", async () => {
    const { envLogger } = await import("@/lib/utils/env-logger");

    const circularTitle: Record<string, unknown> = {};
    circularTitle.self = circularTitle;

    const data: Record<string, unknown> = { id: "1", title: circularTitle };

    const circularContext: Record<string, unknown> = {};
    circularContext.self = circularContext;

    expect(() => envLogger.log("Test", data, { context: circularContext })).not.toThrow();
  });
});

describe("client error logging", () => {
  it("validates typed client-error telemetry fields and rejects unknown keys", () => {
    const telemetry = {
      message: "Chunk failed to load",
      chunkId: "app-layout",
      performance: { durationMs: 125, cached: false },
    };

    expect(clientErrorSchema.parse(telemetry)).toEqual(telemetry);
    expect(
      clientErrorSchema.safeParse({ ...telemetry, diagnostics: { retryCount: 2 } }).success,
    ).toBe(false);
  });

  it("writes typed client-error telemetry to the server log", async () => {
    const appendFile = vi.spyOn(fs.promises, "appendFile").mockResolvedValue();
    const existsSync = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const telemetry = {
      message: "Chunk failed to load",
      chunkId: "app-layout",
      performance: { durationMs: 125 },
    };

    try {
      const request = Object.assign(
        new NextRequest("http://localhost:3000/api/log-client-error", { method: "POST" }),
        { json: async () => telemetry },
      );
      const response = await logClientError(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(appendFile).toHaveBeenCalledOnce();
      expect(String(appendFile.mock.calls[0]?.[1])).toContain('"chunkId":"app-layout"');
    } finally {
      appendFile.mockRestore();
      existsSync.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("returns a parsed message error", () => {
    const error = apiErrorResponseSchema.parse({ message: "Message error" });

    expect(getErrorMessage(error, "Fallback error")).toBe("Message error");
  });

  it("returns a parsed error field", () => {
    const error = apiErrorResponseSchema.parse({ error: "Error field" });

    expect(getErrorMessage(error, "Fallback error")).toBe("Error field");
  });

  it("falls back for missing and malformed error payloads", () => {
    expect(getErrorMessage({}, "Fallback error")).toBe("Fallback error");
    expect(getErrorMessage({ error: 500 }, "Fallback error")).toBe("Fallback error");
  });
});
