/**
 * @fileoverview Tests for client-side instrumentation error filtering
 */

describe("shouldFilterError", () => {
  it("filters known browser extension errors", async () => {
    const { shouldFilterError } = await import("@/instrumentation-client");
    expect(shouldFilterError("chrome-extension:// runtime.sendMessage failed")).toBe(true);
  });

  it("returns false for non-string values without throwing", async () => {
    const { shouldFilterError } = await import("@/instrumentation-client");
    const nonString = { message: "chrome-extension:// error" };
    expect(() => shouldFilterError(nonString)).not.toThrow();
    expect(shouldFilterError(nonString)).toBe(false);
  });
});
