console.log("[SETUP] Executing server-only-mock.ts");

// Mock ensure-server-only globally before any tests run
vi.mock("../../src/lib/utils/ensure-server-only", () => ({
  assertServerOnly: vi.fn(() => undefined),
}));
