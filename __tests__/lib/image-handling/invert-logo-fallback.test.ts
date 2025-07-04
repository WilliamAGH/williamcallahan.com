// New test verifying fallback behavior when image-js cannot be imported

// Mock image-js to throw during dynamic import, simulating environments where
// native Canvas bindings are unavailable (e.g., edge runtimes).
jest.mock("image-js", () => {
  throw new Error("MODULE_NOT_FOUND");
});

import { invertLogoBuffer } from "@/lib/image-handling/invert-logo";

describe("invertLogoBuffer (dynamic import failure)", () => {
  it("returns the original buffer when image-js import fails", async () => {
    const original = Buffer.from("dummy");
    const { buffer: result } = await invertLogoBuffer(original);
    // Should be the exact same Buffer instance (no mutation)
    expect(result).toBe(original);
  });
});
