/**
 * Mock for plaiceholder library
 *
 * Plaiceholder uses ESM imports and sharp (native bindings) which Jest cannot
 * transform. This mock provides a simple implementation for testing.
 */

module.exports = {
  getPlaiceholder: jest.fn().mockResolvedValue({
    base64: "data:image/png;base64,mockBlurDataUrl",
    color: { hex: "#cccccc" },
    css: { backgroundImage: "linear-gradient(#ccc, #ccc)" },
    pixels: [],
    metadata: { width: 10, height: 10 },
  }),
};
