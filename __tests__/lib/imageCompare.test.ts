//  * NOTE: Any edits to this file's tests always fail so far, don't try improving

import { describe, expect, it, jest } from '@jest/globals';
import { compareImages } from '../../lib/imageCompare';
import { logger } from '../../lib/logger';
import type { Metadata, FormatEnum } from 'sharp';

type SharpInstance = {
  metadata: () => Promise<Metadata>;
  toBuffer: () => Promise<Buffer>;
  png: () => SharpInstance;
  grayscale: () => SharpInstance;
  raw: () => SharpInstance;
  resize: (width: number, height: number, options: any) => SharpInstance;
};

// Mock sharp
const createMockSharp = (metadata: Partial<Metadata> = {}): SharpInstance => ({
  metadata: () => Promise.resolve({
    width: 256,
    height: 256,
    format: 'png' as keyof FormatEnum,
    ...metadata
  }),
  toBuffer: () => Promise.resolve(Buffer.from('test-image')),
  png: function() { return this; },
  grayscale: function() { return this; },
  raw: function() { return this; },
  resize: function() { return this; }
});

const mockSharp = jest.fn(() => createMockSharp());

jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharp,
}));

describe('Image Comparison', () => {
  beforeEach(() => {
    logger.setSilent(true);
    mockSharp.mockClear();
  });

  it('should handle different image sizes', async () => {
    mockSharp.mockImplementationOnce(() => createMockSharp({
      width: 64,
      height: 64,
      format: 'png' as keyof FormatEnum
    }));

    mockSharp.mockImplementationOnce(() => createMockSharp({
      width: 256,
      height: 256,
      format: 'png' as keyof FormatEnum
    }));

    const image1 = Buffer.from('small-image');
    const image2 = Buffer.from('large-image');
    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });

  it('should handle invalid image formats', async () => {
    mockSharp.mockImplementationOnce(() => createMockSharp({
      width: 256,
      height: 256,
      format: 'raw' as keyof FormatEnum
    }));

    mockSharp.mockImplementationOnce(() => createMockSharp({
      width: 256,
      height: 256,
      format: 'png' as keyof FormatEnum
    }));

    const image1 = Buffer.from('invalid-image');
    const image2 = Buffer.from('valid-image');
    const result = await compareImages(image1, image2);
    expect(result).toBe(false);
  });
});
