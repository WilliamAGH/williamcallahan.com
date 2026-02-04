/**
 * @fileoverview Tests for instrumentation register hook
 * @vitest-environment node
 */

vi.mock("../../src/instrumentation-node", () => ({
  register: vi.fn(),
}));

vi.mock("../../src/instrumentation-edge", () => ({
  register: vi.fn(),
}));

describe("instrumentation register", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("invokes node instrumentation register in node runtime", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_RUNTIME = "nodejs";

    const { register } = await import("@/instrumentation");
    await register();

    const nodeModule = await import("../../src/instrumentation-node");
    expect(nodeModule.register).toHaveBeenCalledTimes(1);
  });

  it("invokes edge instrumentation register in edge runtime", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_RUNTIME = "edge";

    const { register } = await import("@/instrumentation");
    await register();

    const edgeModule = await import("../../src/instrumentation-edge");
    expect(edgeModule.register).toHaveBeenCalledTimes(1);
  });

  it("skips instrumentation in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_RUNTIME = "nodejs";

    const { register } = await import("@/instrumentation");
    await register();

    const nodeModule = await import("../../src/instrumentation-node");
    expect(nodeModule.register).not.toHaveBeenCalled();
  });
});
