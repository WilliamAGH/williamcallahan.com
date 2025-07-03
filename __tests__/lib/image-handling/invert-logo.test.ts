// Dynamically obtain TextEncoder/TextDecoder from the util package – works across Node versions.
const { TextEncoder: UtilTextEncoder, TextDecoder: UtilTextDecoder } = require("node:util");

if (typeof global.TextEncoder === "undefined" && UtilTextEncoder) {
  // @ts-expect-error assign
  global.TextEncoder = UtilTextEncoder;
}

if (typeof global.TextDecoder === "undefined" && UtilTextDecoder) {
  // @ts-expect-error assign
  global.TextDecoder = UtilTextDecoder as unknown as typeof global.TextDecoder;
}

import { Image } from "image-js";
import { invertLogoBuffer } from "@/lib/image-handling/invert-logo";

/**
 * Generates a 1×1 PNG with a single RGB pixel.
 * Returns the encoded PNG buffer and the original pixel data.
 */
function generateSinglePixelPng(r: number, g: number, b: number): Buffer {
  const img = new Image(1, 1, { kind: "RGB" });
  img.setPixelXY(0, 0, [r, g, b]);
  const buffer = Buffer.from(img.toBuffer({ format: "png" }));
  return buffer;
}

describe("invertLogoBuffer", () => {
  it("inverts a simple red pixel PNG", async () => {
    // Original pixel: red (255,0,0) – inverted should be cyan (0,255,255)
    const redPng = generateSinglePixelPng(255, 0, 0);

    const { buffer: inverted } = await invertLogoBuffer(redPng);

    const invertedImg = await Image.load(inverted);
    const [r, g, b] = invertedImg.getPixelXY(0, 0);

    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });
});
