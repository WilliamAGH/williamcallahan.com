import { analyzeLogo, invertLogo, doesLogoNeedInversion } from '../../lib/imageAnalysis';
import sharp from 'sharp';

// Mock sharp
jest.mock('sharp');

// Create a more specific type for our mock
type SharpMock = jest.Mock & typeof sharp;
const mockSharp = sharp as unknown as SharpMock;

describe('Logo Analysis', () => {
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

    // Setup default mock implementation
    mockSharp.mockImplementation(() => createMockInstance());
  });

  describe('analyzeLogo', () => {
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

    it('should handle invalid logo formats', async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: 'invalid',
          width: 100,
          height: 100
        })
      }));

      await expect(analyzeLogo(Buffer.from([0]))).rejects.toThrow('Invalid image format');
    });

    it('should detect logo transparency correctly', async () => {
      const testBuffer = Buffer.from([0]);
      const result = await analyzeLogo(testBuffer);
      expect(result.hasTransparency).toBe(true);
    });
  });

  describe('invertLogo', () => {
    it('should invert logo colors', async () => {
      const testBuffer = Buffer.from([0]);
      await invertLogo(testBuffer);
      expect(mockSharp).toHaveBeenCalledWith(testBuffer, { pages: 1 });
    });

    it('should preserve logo transparency when requested', async () => {
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

    it('should handle invalid logo formats', async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({
          format: 'invalid',
          width: 100,
          height: 100
        })
      }));

      await expect(invertLogo(Buffer.from([0]))).rejects.toThrow('Invalid image format');
    });
  });

  describe('doesLogoNeedInversion', () => {
    it('should invert light logos in light theme (to be visible against light background)', async () => {
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

    it('should invert dark logos in dark theme (to be visible against dark background)', async () => {
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

    it('should not invert light logos in dark theme (already visible against dark background)', async () => {
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

    it('should not invert dark logos in light theme (already visible against light background)', async () => {
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

    it('should handle logo analysis errors', async () => {
      mockSharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockRejectedValue(new Error('Analysis failed'))
      }));

      await expect(doesLogoNeedInversion(Buffer.from([0]), true)).rejects.toThrow('Analysis failed');
    });
  });
});
