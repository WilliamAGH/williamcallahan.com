/**
 * @fileoverview Tests for instrumentation register hook
 * @vitest-environment node
 */

describe("instrumentation register", () => {
  const ORIGINAL_ENV = { ...process.env };

  const mockRuntimeModules = (): void => {
    vi.doMock("../../src/instrumentation-node", () => ({
      register: vi.fn(),
    }));

    vi.doMock("../../src/instrumentation-edge", () => ({
      register: vi.fn(),
    }));
  };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  it("invokes node instrumentation register in node runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_RUNTIME = "nodejs";
    mockRuntimeModules();

    const { register } = await import("@/instrumentation");
    await register();

    const nodeModule = await import("../../src/instrumentation-node");
    expect(nodeModule.register).toHaveBeenCalledTimes(1);
  });

  it("invokes edge instrumentation register in edge runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_RUNTIME = "edge";
    mockRuntimeModules();

    const { register } = await import("@/instrumentation");
    await register();

    const edgeModule = await import("../../src/instrumentation-edge");
    expect(edgeModule.register).toHaveBeenCalledTimes(1);
  });

  it("skips instrumentation in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.NEXT_RUNTIME = "nodejs";
    mockRuntimeModules();

    const { register } = await import("@/instrumentation");
    await register();

    const nodeModule = await import("../../src/instrumentation-node");
    expect(nodeModule.register).not.toHaveBeenCalled();
  });

  it("forwards redacted request error context to Sentry synchronously", async () => {
    const captureRequestError = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({ captureRequestError }));
    mockRuntimeModules();

    const { onRequestError } = await import("@/instrumentation");
    const error = new Error("render failed");
    const request = {
      path: "/books/node",
      method: "GET",
      headers: {
        host: "williamcallahan.com",
        Authorization: "Bearer secret",
        cookie: "session=secret",
        "X-API-Key": "secret-key",
        "x-refresh-secret": "refresh-secret",
      },
    } as const;
    const context = {
      routerKind: "App Router",
      routePath: "/books/[book-slug]",
      routeType: "render",
      revalidateReason: undefined,
    } as const;

    onRequestError(error, request, context);

    expect(captureRequestError).toHaveBeenCalledWith(
      error,
      {
        ...request,
        headers: {
          host: "williamcallahan.com",
          Authorization: "[REDACTED]",
          cookie: "[REDACTED]",
          "X-API-Key": "[REDACTED]",
          "x-refresh-secret": "[REDACTED]",
        },
      },
      context,
    );
  });
});

describe("node instrumentation register", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      NEXT_PHASE: "",
      SENTRY_DSN: "https://public@example.com/1",
    };
    globalThis.INSTRUMENTATION_NODE_INSTALLED = undefined;
    vi.resetModules();
    vi.doUnmock("../../src/instrumentation-node");
    vi.doUnmock("../../src/instrumentation-edge");
    vi.doUnmock("@/instrumentation-node");
    vi.doUnmock("@/instrumentation-edge");
    vi.clearAllMocks();
    vi.doMock("@sentry/nextjs", () => ({
      init: vi.fn(),
      zodErrorsIntegration: vi.fn(() => ({ name: "ZodErrors" })),
      extraErrorDataIntegration: vi.fn(() => ({ name: "ExtraErrorData" })),
      dedupeIntegration: vi.fn(() => ({ name: "Dedupe" })),
    }));
    vi.doMock("@/lib/sentry/resolve-environment", () => ({
      resolveSentryEnvironment: () => "test",
    }));
    vi.doMock("@/lib/image-handling/image-manifest-loader", () => ({
      loadImageManifests: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/rate-limiter", () => ({
      loadRateLimitStore: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/constants", () => ({
      JINA_FETCH_STORE_NAME: "jina",
      JINA_FETCH_RATE_LIMIT_STORE_KEY: "jina-key",
    }));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.INSTRUMENTATION_NODE_INSTALLED = undefined;
    vi.restoreAllMocks();
  });

  it("leaves unhandled promise rejection capture to Sentry defaults", async () => {
    const processOn = vi.spyOn(process, "on");
    const { register } = await import("@/instrumentation-node");

    await register();

    const Sentry = await import("@sentry/nextjs");
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(processOn).not.toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
  });
});
