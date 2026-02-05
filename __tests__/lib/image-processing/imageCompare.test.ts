// Vitest provides describe, expect, it, beforeEach globally
import { compareImages } from "@/lib/image-handling/image-compare";
import logger from "@/lib/utils/logger";

// TODO(wasm-image): These tests reflect the current SHA-256 hash-based implementation.
// When WASM perceptual hashing is implemented, update tests to cover perceptual similarity.

describe("Image Comparison", () => {
  beforeEach(() => {
    logger.setSilent(true);
  });

  it("should return true for identical buffers", async () => {
    const imageData = "identical-image-data";
    const image1 = Buffer.from(imageData);
    const image2 = Buffer.from(imageData);

    const result = await compareImages(image1, image2);
    expect(result).toBe(true);
  });

  it("should return false for different buffers", async () => {
    const image1 = Buffer.from("first-image-data");
    const image2 = Buffer.from("second-image-data");

    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });

  it("should return false for buffers with same content but different encoding", async () => {
    const image1 = Buffer.from("test-image", "utf8");
    const image2 = Buffer.from("test-image", "base64");

    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });

  it("should handle empty buffers", async () => {
    const image1 = Buffer.alloc(0);
    const image2 = Buffer.alloc(0);

    const result = await compareImages(image1, image2);
    expect(result).toBe(true);
  });

  it("should return false when comparing empty with non-empty buffer", async () => {
    const image1 = Buffer.alloc(0);
    const image2 = Buffer.from("some-data");

    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });
});
