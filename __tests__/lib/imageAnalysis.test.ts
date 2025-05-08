import { describe, it, expect, jest, mock, beforeEach } from 'bun:test';
import type { Sharp, Metadata } from 'sharp';
import {
  analyzeLogo,
  invertLogo,
  doesLogoNeedInversion,
  analyzeImage, // Include legacy export for coverage
  ImageAnalysisError // Import error class
} from "../../lib/imageAnalysis";
import { VALID_IMAGE_FORMATS } from "../../lib/constants";

// Helper type to make mocking chainable methods easier
type MockedSharp = {
  [K in keyof Sharp]: Sharp[K] extends (...args: infer P) => Sharp
    ? jest.Mock<(...args: P) => MockedSharp>
    : Sharp[K] extends (...args: infer P) => Promise<infer R>
      ? jest.Mock<(...args: P) => Promise<R>>
      : Sharp[K];
};

// Define the mock factory function
const createMockSharp = (metadata: Partial<Metadata> = {}): Partial<MockedSharp> => {
  const mockMetadata = jest.fn().mockResolvedValue({
    width: 100,
    height: 100,
    format: 'png',
    hasAlpha: true,
    ...metadata
  } as Metadata);

  // Create a mock with chainable methods
  const mockSharp: Partial<MockedSharp> = {
    metadata: mockMetadata,
    raw: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    negate: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    extractChannel: jest.fn().mockReturnThis(),
    joinChannel: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockImplementation(({ resolveWithObject }: { resolveWithObject?: boolean } = {}) => {
      if (resolveWithObject) {
        return Promise.resolve({
          data: Buffer.from([255, 255]),
          info: { channels: 2 }
        });
      }
      return Promise.resolve(Buffer.from([0, 0, 0]));
    }),
    clone: jest.fn().mockImplementation(() => createMockSharp(metadata))
  };

  return mockSharp;
};

// Use a variable to hold the mock implementation, accessible within the module scope
const sharpImplementation = jest.fn(createMockSharp);

// Mock sharp using mock.module
void mock.module("sharp", () => {
  // Return the mock implementation function as the default export
  return {
    __esModule: true,
    default: sharpImplementation // Use the variable here
  };
});

// Static import - Bun should intercept this
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Required for mocking to work properly
import sharp from 'sharp';

/**
 * Test data constants
 */
const TEST_DATA = {
  LIGHT_PIXEL: 200, // Light colored pixel value
  DARK_PIXEL: 50,   // Dark colored pixel value
  ALPHA_FULL: 255,  // Fully opaque
  ALPHA_SEMI: 128,  // Semi-transparent
  IMAGE_SIZE: 100,  // Test image dimensions
  FORMATS: VALID_IMAGE_FORMATS
} as const;

describe("Logo Analysis Module", () => {
  beforeEach(() => {
    // Reset the mock function calls AND implementation
    sharpImplementation.mockClear();
    sharpImplementation.mockImplementation(createMockSharp); // Reset to default factory
  });

  /**
   * Helper function to create a mock image buffer with specific brightness
   * @param brightness - Pixel brightness value (0-255)
   * @param hasAlpha - Whether to include alpha channel
   */
  const createMockImageBuffer = (brightness: number, hasAlpha = false) => {
    // Use sharpImplementation to set the mock for the next call
    sharpImplementation.mockImplementationOnce(() => {
      // These TypeScript errors are expected in a test mock
      const mock: Partial<MockedSharp> = {
        metadata: jest.fn().mockResolvedValue({
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE,
          format: "png",
          hasAlpha
        } as Metadata),
        raw: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockImplementation(({ resolveWithObject }: { resolveWithObject?: boolean } = {}) => {
          if (resolveWithObject) {
            const pixels = new Uint8Array(TEST_DATA.IMAGE_SIZE * TEST_DATA.IMAGE_SIZE);
            pixels.fill(brightness);
            return Promise.resolve({
              data: Buffer.from(pixels),
              info: { channels: hasAlpha ? 2 : 1 }
            });
          }
          return Promise.resolve(Buffer.from([brightness]));
        })
      };
      return mock;
    });
    return Buffer.from([0]);
  };

  describe("analyzeLogo", () => {
    it('should analyze logo brightness and transparency', async () => {
      const testBuffer = Buffer.from([0]);
      const result = await analyzeLogo(testBuffer);

      expect(result).toEqual({
        averageBrightness: expect.any(Number),
        isLightColored: expect.any(Boolean),
        needsInversionInLightTheme: expect.any(Boolean),
        needsInversionInDarkTheme: expect.any(Boolean),
        hasTransparency: expect.any(Boolean),
        format: 'png',
        dimensions: { width: 100, height: 100 }
      });
    });

    it("should handle invalid logo formats", () => {
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "invalid",
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE
        })
      }));

      return expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(
        `Invalid image format: invalid. Must be one of: ${TEST_DATA.FORMATS.join(", ")}`
      );
    });

    it("should handle missing dimensions", () => {
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "png",
          width: 0,
          height: 0
        })
      }));

      return expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(
        "Invalid image dimensions: 0x0. Must be positive numbers."
      );
    });

    it("should handle sharp errors gracefully", () => {
      const errorMessage = "Failed to get image metadata: Sharp processing failed";
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      return expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(errorMessage);
    });

    it('should detect logo transparency correctly', async () => {
      const testBuffer = Buffer.from([0]);
      const result = await analyzeLogo(testBuffer);
      expect(result.hasTransparency).toBe(true);
    });
  });

  describe("invertLogo", () => {
    it('should invert logo colors', async () => {
      const testBuffer = Buffer.from([0]);
      await invertLogo(testBuffer);
      expect(sharpImplementation).toHaveBeenCalledWith(testBuffer, { pages: 1 });
    });

    it("should preserve logo transparency when requested", async () => {
      const testBuffer = Buffer.from([0]);
      const mockAlphaBuffer = Buffer.from([255]);

      sharpImplementation.mockImplementationOnce(() => {
        const mock: Partial<MockedSharp> = {
          metadata: jest.fn().mockResolvedValue({
            width: 100,
            height: 100,
            format: 'png',
            hasAlpha: true
          }),
          clone: jest.fn().mockImplementation(() => ({
            extractChannel: jest.fn().mockReturnThis(),
            toBuffer: jest.fn().mockResolvedValue(mockAlphaBuffer)
          })),
          negate: jest.fn().mockReturnThis(),
          joinChannel: jest.fn().mockReturnThis(),
          png: jest.fn().mockReturnThis(),
          toBuffer: jest.fn().mockResolvedValue(Buffer.from([0]))
        };
        return mock;
      });

      await invertLogo(testBuffer, true);
    });

    it("should handle invalid logo formats with specific error", () => {
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "invalid",
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE
        })
      }));

      return expect(invertLogo(Buffer.from([0]))).rejects.toThrow(
        `Invalid image format: invalid. Must be one of: ${TEST_DATA.FORMATS.join(", ")}`
      );
    });

    it("should handle sharp processing errors", () => {
      const errorMessage = "Failed to get image metadata: Processing failed";
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      return expect(invertLogo(Buffer.from([0]))).rejects.toThrow(errorMessage);
    });
  });

  describe("doesLogoNeedInversion", () => {
    it("should invert light logos in light theme for visibility", async () => {
      // Mock a light logo (brightness > 128)
      const mockInstance: Partial<MockedSharp> = {
        metadata: jest.fn().mockResolvedValue({
          width: 100,
          height: 100,
          format: 'png',
          hasAlpha: true
        }),
        raw: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
          if (resolveWithObject) {
            // Create a 100x100 light-colored image
            const pixels = new Uint8Array(10000);
            pixels.fill(200); // Light pixels
            return Promise.resolve({
              data: Buffer.from(pixels),
              info: { channels: 1 } // Grayscale
            });
          }
          return Promise.resolve(Buffer.from([200]));
        })
      };

      sharpImplementation.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, false); // Light theme
      expect(result).toBe(true); // Light logo needs inversion in light theme
    });

    it("should invert dark logos in dark theme for visibility", async () => {
      // Mock a dark logo (brightness < 128)
      const mockInstance: Partial<MockedSharp> = {
        metadata: jest.fn().mockResolvedValue({
          width: 100,
          height: 100,
          format: 'png',
          hasAlpha: true
        }),
        raw: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
          if (resolveWithObject) {
            // Create a 100x100 dark-colored image
            const pixels = new Uint8Array(10000);
            pixels.fill(50); // Dark pixels
            return Promise.resolve({
              data: Buffer.from(pixels),
              info: { channels: 1 } // Grayscale
            });
          }
          return Promise.resolve(Buffer.from([50]));
        })
      };

      sharpImplementation.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, true); // Dark theme
      expect(result).toBe(true); // Dark logo needs inversion in dark theme
    });

    it("should not invert light logos in dark theme (already visible)", async () => {
      // Mock a light logo (brightness > 128)
      const mockInstance: Partial<MockedSharp> = {
        metadata: jest.fn().mockResolvedValue({
          width: 100,
          height: 100,
          format: 'png',
          hasAlpha: true
        }),
        raw: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
          if (resolveWithObject) {
            // Create a 100x100 light-colored image
            const pixels = new Uint8Array(10000);
            pixels.fill(200); // Light pixels
            return Promise.resolve({
              data: Buffer.from(pixels),
              info: { channels: 1 } // Grayscale
            });
          }
          return Promise.resolve(Buffer.from([200]));
        })
      };

      sharpImplementation.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, true); // Dark theme
      expect(result).toBe(false); // Light logo is already visible in dark theme
    });

    it("should not invert dark logos in light theme (already visible)", async () => {
      // Mock a dark logo (brightness < 128)
      const mockInstance: Partial<MockedSharp> = {
        metadata: jest.fn().mockResolvedValue({
          width: 100,
          height: 100,
          format: 'png',
          hasAlpha: true
        }),
        raw: jest.fn().mockReturnThis(),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
          if (resolveWithObject) {
            // Create a 100x100 dark-colored image
            const pixels = new Uint8Array(10000);
            pixels.fill(50); // Dark pixels
            return Promise.resolve({
              data: Buffer.from(pixels),
              info: { channels: 1 } // Grayscale
            });
          }
          return Promise.resolve(Buffer.from([50]));
        })
      };

      sharpImplementation.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, false); // Light theme
      expect(result).toBe(false); // Dark logo is already visible in light theme
    });

    it("should handle logo analysis errors with specific message", () => {
      const errorMessage = "Failed to get image metadata: Analysis failed";
      sharpImplementation.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      return expect(doesLogoNeedInversion(Buffer.from([0]), true)).rejects.toThrow(errorMessage);
    });
  });

  describe("Legacy API Compatibility", () => {
    it("should maintain backwards compatibility with analyzeImage", async () => {
      const testBuffer = createMockImageBuffer(TEST_DATA.LIGHT_PIXEL, true);
      const result = await analyzeImage(testBuffer);

      expect(result).toEqual({
        brightness: expect.any(Number),
        needsDarkInversion: expect.any(Boolean),
        needsLightInversion: expect.any(Boolean),
        hasTransparency: true,
        format: "png",
        dimensions: {
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE
        }
      });
    });
  });
});
