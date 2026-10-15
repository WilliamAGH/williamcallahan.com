/**
 * Mock for plaiceholder library
 *
 * Plaiceholder uses ESM imports and sharp (native bindings) which are
 * difficult to transform. This mock provides a simple implementation for testing.
 */
import { vi } from "vitest";
import type * as Plaiceholder from "plaiceholder";

export const getPlaiceholder = vi.fn<typeof Plaiceholder.getPlaiceholder>().mockResolvedValue({
  base64: "data:image/png;base64,mockBlurDataUrl",
  color: { hex: "#cccccc", r: 204, g: 204, b: 204 },
  css: {
    backgroundImage: "linear-gradient(#ccc, #ccc)",
    backgroundPosition: "0 0",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  },
  pixels: [],
  metadata: { width: 10, height: 10, chromaSubsampling: "4:2:0" },
  svg: [
    "svg",
    {
      viewBox: "0 0 10 10",
      width: "100%",
      height: "100%",
      shapeRendering: "crispEdges",
      preserveAspectRatio: "none",
      style: {},
      xmlns: "http://www.w3.org/2000/svg",
    },
    [],
  ],
});

export default { getPlaiceholder };
