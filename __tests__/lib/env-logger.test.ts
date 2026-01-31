/**
 * @fileoverview Tests for envLogger safe stringification
 * @jest-environment node
 */

describe("envLogger", () => {
  const ORIGINAL_ENV = { ...process.env };
  const originalLog = console.log;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      VERBOSE_TEST_LOGS: "true",
      API_BASE_URL: "https://williamcallahan.com",
    };
    jest.resetModules();
    console.log = jest.fn();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    console.log = originalLog;
  });

  it("does not throw when logging circular data in production mode", async () => {
    const { envLogger } = await import("@/lib/utils/env-logger");

    const circularTitle: Record<string, unknown> = {};
    circularTitle.self = circularTitle;

    const data: Record<string, unknown> = { id: "1", title: circularTitle };

    const circularContext: Record<string, unknown> = {};
    circularContext.self = circularContext;

    expect(() => envLogger.log("Test", data, { context: circularContext })).not.toThrow();
  });
});
