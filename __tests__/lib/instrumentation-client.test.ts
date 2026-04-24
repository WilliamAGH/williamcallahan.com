/**
 * @fileoverview Tests for client-side instrumentation error filtering
 */

describe("shouldFilterError", () => {
  it("filters known client-side noise", async () => {
    const { shouldFilterError } = await import("@/instrumentation-client");
    const filteredMessages = [
      "chrome-extension:// runtime.sendMessage failed",
      "Event `Event` (type=error) captured as promise rejection",
      "Error: feature named `pageContext` was not found",
      "Error: The WKWebView was deallocated before the message was delivered",
      "ReportingObserver [deprecation]: The Shared Storage API is deprecated",
    ];

    for (const message of filteredMessages) {
      expect(shouldFilterError(message)).toBe(true);
    }
  });

  it("returns false for non-string values without throwing", async () => {
    const { shouldFilterError } = await import("@/instrumentation-client");
    const nonString = { message: "chrome-extension:// error" };
    expect(() => shouldFilterError(nonString)).not.toThrow();
    expect(shouldFilterError(nonString)).toBe(false);
  });
});
