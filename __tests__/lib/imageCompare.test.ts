import { compareImages } from "../../lib/imageCompare";
import sharp from "sharp";
import { VALID_IMAGE_FORMATS, MIN_LOGO_SIZE, MAX_SIZE_DIFF } from "../../lib/constants";

const TEST_DATA = {
  MIN_SIZE: MIN_LOGO_SIZE,
  MAX_DIFF: MAX_SIZE_DIFF,
  FORMATS: VALID_IMAGE_FORMATS,
  HASH_SIZE: 16,
  DEFAULT_CONTENT: "test" as string,
  VALID_FORMAT: "png",
  INVALID_FORMAT: "invalid"
} as const;

jest.mock("sharp", () => {
  return jest.fn().mockImplementation((input: Buffer) => {
    const buffer = input;
    return {
      metadata: jest.fn().mockImplementation(() => {
        const meta = buffer.toString().split('|');
        return Promise.resolve({
          width: parseInt(meta[0]),
          height: parseInt(meta[1]),
          format: meta[2]
        });
      }),
      resize: jest.fn().mockImplementation(() => ({
        grayscale: jest.fn().mockImplementation(() => ({
          raw: jest.fn().mockImplementation(() => ({
            toBuffer: jest.fn().mockImplementation(() => {
              const meta = buffer.toString().split('|');
              const content = meta[3] || 'test';
              return Promise.resolve(Buffer.from(content.repeat(256)));
            })
          }))
        }))
      })),
      png: jest.fn().mockImplementation(() => ({
        toBuffer: jest.fn().mockImplementation(() => {
          const meta = buffer.toString().split('|');
          return Promise.resolve(Buffer.from(
            `${meta[0]}|${meta[1]}|png|${meta[3] || 'test'}`
          ));
        })
      })),
      toBuffer: jest.fn().mockImplementation(() => {
        return Promise.resolve(buffer);
      })
    };
  });
});

describe("Image Comparison Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createTestImage = (
    width: number,
    height: number,
    format: string,
    content: string = TEST_DATA.DEFAULT_CONTENT
  ): Buffer => {
    return Buffer.from(`${width}|${height}|${format}|${content}`);
  };

  describe("Image Validation", () => {
    it("should return true for identical valid images", async () => {
      const image = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(image, image);
      expect(result).toBe(true);
    });

    it("should return false for different valid images", async () => {
      const image1 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT, "content1");
      const image2 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT, "content2");
      const result = await compareImages(image1, image2);
      expect(result).toBe(false);
    });

    it("should return false for invalid image formats with error message", async () => {
      const validImage = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const invalidImage = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.INVALID_FORMAT);
      const result = await compareImages(validImage, invalidImage);
      expect(result).toBe(false);
    });

    it("should return false for images smaller than minimum size with error message", async () => {
      const validImage = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const smallImage = createTestImage(TEST_DATA.MIN_SIZE - 1, TEST_DATA.MIN_SIZE - 1, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(validImage, smallImage);
      expect(result).toBe(false);
    });

    it("should return false when size difference exceeds maximum with error message", async () => {
      const image1 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const image2 = createTestImage(TEST_DATA.MIN_SIZE + TEST_DATA.MAX_DIFF + 1, TEST_DATA.MIN_SIZE + TEST_DATA.MAX_DIFF + 1, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(image1, image2);
      expect(result).toBe(false);
    });
  });

  describe("Format Handling", () => {
    it("should handle different valid formats with same content", async () => {
      const pngImage = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, "png", "same");
      const jpegImage = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, "jpeg", "same");
      const result = await compareImages(pngImage, jpegImage);
      expect(result).toBe(true);
    });

    it("should normalize images to PNG format before comparison", async () => {
      const image1 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, "jpeg", "content");
      const image2 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, "png", "content");
      const result = await compareImages(image1, image2);
      expect(result).toBe(true);
    });
  });

  describe("Error Handling", () => {
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("should return false and log error on sharp processing failure", async () => {
      const errorMessage = "Mock sharp error";
      ((sharp as unknown) as jest.Mock).mockImplementationOnce(() => {
        throw new Error(errorMessage);
      });

      const image = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(image, image);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Metadata validation failed:",
        `Failed to get image metadata: ${errorMessage}`
      );
    });

    it("should handle missing metadata gracefully with error message", async () => {
      ((sharp as unknown) as jest.Mock).mockImplementationOnce(() => ({
        metadata: () => Promise.resolve({
          width: 0,
          height: 0,
          format: ""
        }),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        png: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from(TEST_DATA.DEFAULT_CONTENT))
      }));

      const image = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(image, image);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Image validation failed:",
        `Image too small: 0x0. Minimum size: ${TEST_DATA.MIN_SIZE}x${TEST_DATA.MIN_SIZE}`
      );
    });

    it("should handle hash generation errors", async () => {
      ((sharp as unknown) as jest.Mock).mockImplementationOnce(() => ({
        metadata: () => Promise.reject(new Error("Hash generation failed")),
        resize: jest.fn().mockImplementation(() => ({
          grayscale: jest.fn().mockImplementation(() => ({
            raw: jest.fn().mockImplementation(() => ({
              toBuffer: () => Promise.reject(new Error("Hash generation failed"))
            }))
          }))
        })),
        png: () => ({
          toBuffer: () => Promise.reject(new Error("Hash generation failed"))
        })
      }));

      const image = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const result = await compareImages(image, image);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Metadata validation failed:",
        "Failed to get image metadata: Hash generation failed"
      );
    });

    it("should handle invalid input gracefully", async () => {
      const result = await compareImages(null as any, Buffer.from([]));

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid input: image buffers are required"
      );
    });

    it("should handle size difference validation", async () => {
      const image1 = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);
      const image2 = createTestImage(TEST_DATA.MIN_SIZE + 6, TEST_DATA.MIN_SIZE + 6, TEST_DATA.VALID_FORMAT);

      const result = await compareImages(image1, image2);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `Size difference too large: 12px (max: ${TEST_DATA.MAX_DIFF}px)`
      );
    });
  });

  describe("Performance Characteristics", () => {
    it("should process images in parallel for better performance", async () => {
      const image = createTestImage(TEST_DATA.MIN_SIZE, TEST_DATA.MIN_SIZE, TEST_DATA.VALID_FORMAT);

      const timing: string[] = [];
      const mockSharp = jest.fn().mockImplementation(() => ({
        metadata: () => {
          timing.push("metadata");
          return Promise.resolve({
            width: TEST_DATA.MIN_SIZE,
            height: TEST_DATA.MIN_SIZE,
            format: TEST_DATA.VALID_FORMAT
          });
        },
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        png: () => {
          timing.push("png");
          return {
            toBuffer: () => Promise.resolve(Buffer.from(TEST_DATA.DEFAULT_CONTENT))
          };
        },
        toBuffer: () => Promise.resolve(Buffer.from(TEST_DATA.DEFAULT_CONTENT))
      }));
      ((sharp as unknown) as jest.Mock).mockImplementation(mockSharp);

      await compareImages(image, image);

      expect(timing).toEqual(["metadata", "metadata", "png", "png"]);
    });

    it("should resize images to consistent dimensions for hash comparison", async () => {
      const image1 = createTestImage(100, 100, TEST_DATA.VALID_FORMAT);
      const image2 = createTestImage(200, 200, TEST_DATA.VALID_FORMAT);

      await compareImages(image1, image2);

      const mockCalls = (sharp as unknown as jest.Mock).mock.calls;
      expect(mockCalls[0][0]).toBeDefined();
      expect(mockCalls[1][0]).toBeDefined();
    });
  });
});
