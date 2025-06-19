// Jest provides describe, expect, it, beforeEach globally
import type { SharpInstance } from "@/types/test";
import { compareImages } from "@/lib/image-handling/image-compare";
import { logger } from "@/lib/logger";
import type { Metadata, FormatEnum, ResizeOptions } from "sharp";

// Mock sharp
const createMockSharp = (metadata: Partial<Metadata> = {}): SharpInstance => ({
  metadata: (): Promise<Metadata> =>
    Promise.resolve({
      // Explicitly type the return promise
      width: 256,
      height: 256,
      format: "png" as keyof FormatEnum,
      ...metadata,
    } as Metadata), // Add type assertion here
  toBuffer: () => Promise.resolve(Buffer.from("test-image")),
  png: function () {
    return this;
  },
  grayscale: function () {
    return this;
  },
  raw: function () {
    return this;
  },
  resize: function () {
    return this;
  },
});

// Mock sharp module
jest.mock("sharp");

import sharp from "sharp";

const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

describe("Image Comparison", () => {
  beforeEach(() => {
    logger.setSilent(true);
    jest.clearAllMocks();
    mockSharp.mockImplementation(createMockSharp as any);
  });

  it("should handle different image sizes", async () => {
    mockSharp.mockImplementationOnce(() =>
      createMockSharp({
        width: 64,
        height: 64,
        format: "png" as keyof FormatEnum,
      }),
    );

    mockSharp.mockImplementationOnce(() =>
      createMockSharp({
        width: 256,
        height: 256,
        format: "png" as keyof FormatEnum,
      }),
    );

    const image1 = Buffer.from("small-image");
    const image2 = Buffer.from("large-image");
    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });

  it("should handle invalid image formats", async () => {
    mockSharp.mockImplementationOnce(() =>
      createMockSharp({
        width: 256,
        height: 256,
        format: "raw" as keyof FormatEnum,
      }),
    );

    mockSharp.mockImplementationOnce(() =>
      createMockSharp({
        width: 256,
        height: 256,
        format: "png" as keyof FormatEnum,
      }),
    );

    const image1 = Buffer.from("invalid-image");
    const image2 = Buffer.from("valid-image");
    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });
});
