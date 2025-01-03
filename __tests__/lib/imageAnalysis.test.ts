import {
  analyzeLogo,
  invertLogo,
  doesLogoNeedInversion,
  analyzeImage, // Include legacy export for coverage
  ImageAnalysisError // Import error class
} from "../../lib/imageAnalysis";
import sharp from "sharp";
import { VALID_IMAGE_FORMATS } from "../../lib/constants";

// Mock sharp
jest.mock("sharp");

/**
 * Type definition for our mock Sharp instance
 */
type SharpMock = jest.Mock & typeof sharp;

/**
 * Mock implementation of Sharp
 */
const mockSharp = sharp as unknown as SharpMock;

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
    jest.clearAllMocks();

    // Create a chainable mock instance
    const createMockInstance = () => ({
      metadata: jest.fn().mockResolvedValue({
        width: 100,
        height: 100,
        format: 'png',
        hasAlpha: true
      }),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
        if (resolveWithObject) {
          return Promise.resolve({
            data: Buffer.from([
              // Single grayscale pixel with alpha
              255, 255 // Light pixel (grayscale + alpha)
            ]),
            info: { channels: 2 } // Grayscale + alpha
          });
        }
        return Promise.resolve(Buffer.from([0, 0, 0]));
      }),
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      negate: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      extractChannel: jest.fn().mockReturnThis(),
      joinChannel: jest.fn().mockReturnThis(),
      clone: jest.fn().mockImplementation(() => createMockInstance())
    });

    // Setup default mock implementation with chainable methods
    mockSharp.mockImplementation(() => createMockInstance());
  });

  /**
   * Helper function to create a mock image buffer with specific brightness
   * @param brightness - Pixel brightness value (0-255)
   * @param hasAlpha - Whether to include alpha channel
   */
  const createMockImageBuffer = (brightness: number, hasAlpha = false) => {
    const mockInstance = {
      metadata: jest.fn().mockResolvedValue({
        width: TEST_DATA.IMAGE_SIZE,
        height: TEST_DATA.IMAGE_SIZE,
        format: "png",
        hasAlpha
      }),
      raw: jest.fn().mockReturnThis(),
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockImplementation(({ resolveWithObject } = {}) => {
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
    mockSharp.mockImplementationOnce(() => mockInstance);
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

    it("should handle invalid logo formats", async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "invalid",
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE
        })
      }));

      await expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(
        `Invalid image format: invalid. Must be one of: ${TEST_DATA.FORMATS.join(", ")}`
      );
    });

    it("should handle missing dimensions", async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "png",
          width: 0,
          height: 0
        })
      }));

      await expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(
        "Invalid image dimensions: 0x0. Must be positive numbers."
      );
    });

    it("should handle sharp errors gracefully", async () => {
      const errorMessage = "Failed to get image metadata: Sharp processing failed";
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      await expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow(errorMessage);
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
      expect(mockSharp).toHaveBeenCalledWith(testBuffer, { pages: 1 });
    });

    it("should preserve logo transparency when requested", async () => {
      const testBuffer = Buffer.from([0]);
      const mockAlphaBuffer = Buffer.from([255]);

      // Setup mock instance with alpha channel extraction
      const mockInstance = {
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

      mockSharp.mockImplementationOnce(() => mockInstance);

      await invertLogo(testBuffer, true);

      expect(mockInstance.clone).toHaveBeenCalled();
      expect(mockInstance.negate).toHaveBeenCalledWith({ alpha: false });
      expect(mockInstance.joinChannel).toHaveBeenCalledWith(mockAlphaBuffer);
    });

    it("should handle invalid logo formats with specific error", async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: "invalid",
          width: TEST_DATA.IMAGE_SIZE,
          height: TEST_DATA.IMAGE_SIZE
        })
      }));

      await expect(invertLogo(Buffer.from([0]))).rejects.toThrow(
        `Invalid image format: invalid. Must be one of: ${TEST_DATA.FORMATS.join(", ")}`
      );
    });

    it("should handle sharp processing errors", async () => {
      const errorMessage = "Failed to get image metadata: Processing failed";
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      await expect(invertLogo(Buffer.from([0]))).rejects.toThrow(errorMessage);
    });
  });

  describe("doesLogoNeedInversion", () => {
    it("should invert light logos in light theme for visibility", async () => {
      // Mock a light logo (brightness > 128)
      const mockInstance = {
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

      mockSharp.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, false); // Light theme
      expect(result).toBe(true); // Light logo needs inversion in light theme
    });

    it("should invert dark logos in dark theme for visibility", async () => {
      // Mock a dark logo (brightness < 128)
      const mockInstance = {
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

      mockSharp.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, true); // Dark theme
      expect(result).toBe(true); // Dark logo needs inversion in dark theme
    });

    it("should not invert light logos in dark theme (already visible)", async () => {
      // Mock a light logo (brightness > 128)
      const mockInstance = {
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

      mockSharp.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, true); // Dark theme
      expect(result).toBe(false); // Light logo is already visible in dark theme
    });

    it("should not invert dark logos in light theme (already visible)", async () => {
      // Mock a dark logo (brightness < 128)
      const mockInstance = {
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

      mockSharp.mockImplementationOnce(() => mockInstance);

      const testBuffer = Buffer.from([0]);
      const result = await doesLogoNeedInversion(testBuffer, false); // Light theme
      expect(result).toBe(false); // Dark logo is already visible in light theme
    });

    it("should handle logo analysis errors with specific message", async () => {
      const errorMessage = "Failed to get image metadata: Analysis failed";
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new ImageAnalysisError(errorMessage))
      }));

      await expect(doesLogoNeedInversion(Buffer.from([0]), true)).rejects.toThrow(errorMessage);
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
