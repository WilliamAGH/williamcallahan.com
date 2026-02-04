/**
 * Mock for plaiceholder library
 *
 * Plaiceholder uses ESM imports and sharp (native bindings) which are
 * difficult to transform. This mock provides a simple implementation for testing.
 */
import { vi } from "vitest";

export const getPlaiceholder = vi.fn().mockResolvedValue({
  base64: "data:image/png;base64,mockBlurDataUrl",
  color: { hex: "#cccccc" },
  css: { backgroundImage: "linear-gradient(#ccc, #ccc)" },
  pixels: [],
  metadata: { width: 10, height: 10 },
});

export default { getPlaiceholder };
