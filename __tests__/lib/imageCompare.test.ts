import { compareImages } from '../../lib/imageCompare';
import sharp from 'sharp';
import { MIN_LOGO_SIZE, MAX_SIZE_DIFF } from '../../lib/constants';

// Mock sharp
jest.mock('sharp', () => {
  return jest.fn().mockImplementation((input: Buffer) => {
    // Store the input buffer to access in our mock methods
    const buffer = input;

    return {
      metadata: jest.fn().mockImplementation(() => {
        // Parse our test buffer to get mock metadata
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
              // For normalized raw pixel data, use content to create unique data
              const meta = buffer.toString().split('|');
              const content = meta[3] || 'test';
              // Create unique pixel data based on content
              return Promise.resolve(Buffer.from(content.repeat(256))); // 16x16 pixels
            })
          }))
        }))
      })),
      png: jest.fn().mockImplementation(() => ({
        toBuffer: jest.fn().mockImplementation(() => {
          // For PNG conversion, preserve content but standardize format
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

describe('imageCompare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create test image buffers
  const createTestImage = (width: number, height: number, format: string, content = 'test') => {
    return Buffer.from(`${width}|${height}|${format}|${content}`);
  };

  describe('compareImages', () => {
    it('should return true for identical valid images', async () => {
      const image = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const result = await compareImages(image, image);
      expect(result).toBe(true);
    });

    it('should return false for different valid images', async () => {
      const image1 = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png', 'content1');
      const image2 = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png', 'content2');
      const result = await compareImages(image1, image2);
      expect(result).toBe(false);
    });

    it('should return false for invalid image formats', async () => {
      const validImage = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const invalidImage = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'invalid');
      const result = await compareImages(validImage, invalidImage);
      expect(result).toBe(false);
    });

    it('should return false for images smaller than minimum size', async () => {
      const validImage = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const smallImage = createTestImage(MIN_LOGO_SIZE - 1, MIN_LOGO_SIZE - 1, 'png');
      const result = await compareImages(validImage, smallImage);
      expect(result).toBe(false);
    });

    it('should return false when size difference exceeds maximum', async () => {
      const image1 = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const image2 = createTestImage(
        MIN_LOGO_SIZE + MAX_SIZE_DIFF + 1,
        MIN_LOGO_SIZE + MAX_SIZE_DIFF + 1,
        'png'
      );
      const result = await compareImages(image1, image2);
      expect(result).toBe(false);
    });

    it('should handle different image formats but same content', async () => {
      const pngImage = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png', 'same');
      const jpegImage = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'jpeg', 'same');
      const result = await compareImages(pngImage, jpegImage);
      expect(result).toBe(true);
    });

    it('should return false on sharp errors', async () => {
      // Mock sharp to throw an error
      ((sharp as unknown) as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Mock sharp error');
      });

      const image = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const result = await compareImages(image, image);
      expect(result).toBe(false);
    });

    it('should handle missing metadata gracefully', async () => {
      // Mock sharp to return undefined metadata
      ((sharp as unknown) as jest.Mock).mockImplementationOnce(() => ({
        metadata: () => Promise.resolve({}),
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        png: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('test'))
      }));

      const image = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');
      const result = await compareImages(image, image);
      expect(result).toBe(false);
    });

    it('should process images in parallel', async () => {
      const image = createTestImage(MIN_LOGO_SIZE, MIN_LOGO_SIZE, 'png');

      // Create timing array to track order of operations
      const timing: string[] = [];
      const mockSharp = jest.fn().mockImplementation(() => ({
        metadata: () => {
          timing.push('metadata');
          return Promise.resolve({ width: MIN_LOGO_SIZE, height: MIN_LOGO_SIZE, format: 'png' });
        },
        resize: jest.fn().mockReturnThis(),
        grayscale: jest.fn().mockReturnThis(),
        raw: jest.fn().mockReturnThis(),
        png: () => {
          timing.push('png');
          return { toBuffer: () => Promise.resolve(Buffer.from('test')) };
        },
        toBuffer: () => Promise.resolve(Buffer.from('test'))
      }));
      ((sharp as unknown) as jest.Mock).mockImplementation(mockSharp);

      await compareImages(image, image);

      // Check that metadata calls happened together, then PNG conversions
      expect(timing).toEqual(['metadata', 'metadata', 'png', 'png']);
    });
  });
});
