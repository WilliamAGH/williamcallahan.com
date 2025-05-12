// __tests__/lib/data-access.s3.test.ts
import { describe, it, expect, beforeEach, afterEach, jest, mock } from 'bun:test';

// Explicitly mock ServerCacheInstance for this test suite
const mockClearAllLogoFetches = jest.fn();
const mockGetLogoFetch = jest.fn();
const mockSetLogoFetch = jest.fn();

void mock.module('../../lib/server-cache', () => ({
  ServerCacheInstance: {
    clearAllLogoFetches: mockClearAllLogoFetches,
    getLogoFetch: mockGetLogoFetch,
    setLogoFetch: mockSetLogoFetch,
    // Add any other ServerCacheInstance methods if getLogo in data-access.ts uses them.
    // For now, these are the primary ones related to the errors and logo fetching.
  }
}));

// Prevent getLogo from hitting external sources during this test suite
process.env.SKIP_EXTERNAL_LOGO_FETCH = 'true';
import { getLogo } from '../../lib/data-access'; // Will use the mocked ServerCacheInstance
import { writeBinaryS3, deleteFromS3 } from '../../lib/s3-utils';
// The import below will also point to the mocked ServerCacheInstance due to mock.module hoisting.
// We can use this reference to configure mock return values or check calls.
import { createHash } from 'node:crypto';
import type { LogoSource } from '../../types';

// Determine if S3 integration tests can run
const canRunSuite = Boolean(
  process.env.S3_BUCKET && process.env.S3_SERVER_URL && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.AWS_REGION
);
// Use describeOrSkip to skip suite when S3 env vars are missing
const describeOrSkip = canRunSuite ? (...args: Parameters<typeof describe>) => describe(...args) : (...args: Parameters<typeof describe.skip>) => describe.skip(...args);

// Helper to calculate expected S3 key (mirroring logic in data-access)
const S3_LOGOS_KEY_PREFIX = 'images/logos';
// Logo fetch cache key prefix
const LOGO_FETCH_PREFIX = 'logo-fetch:';

function getTestLogoS3Key(domain: string, source: LogoSource, extension: string): string {
  const getDomainHash = (d: string): string => createHash('md5').update(d).digest('hex');
  const hash = getDomainHash(domain).substring(0, 8);
  const domainPart = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${S3_LOGOS_KEY_PREFIX}/${domainPart}_${hash}_${sourceAbbr}.${extension}`;
}

// Helper function to clear the logo fetch cache
const clearLogoFetchCache = (): void => {
  // This will now call the mocked version

  mockClearAllLogoFetches();
  // Reset other mocks that might be stateful between tests if necessary
  mockGetLogoFetch.mockReset();
  mockSetLogoFetch.mockReset();
};

// Run or skip tests based on S3 env vars
describeOrSkip('getLogo S3 Integration', () => {
  const testDomain = 's3testdomain.com';
  const testSource: LogoSource = 'google'; // Arbitrary source for testing
  const testExtension = 'png';
  const testS3Key = getTestLogoS3Key(testDomain, testSource, testExtension);
  const testLogoBuffer = Buffer.from('dummy-png-data-for-s3-test');
  const testContentType = 'image/png';

  beforeEach(async () => {
    // Clear/reset mocks before each test
    clearLogoFetchCache();

    if (canRunSuite) {
      // Upload test logo to S3
      console.log(`[Test Setup] Writing test logo to S3: ${testS3Key}`);
      await writeBinaryS3(testS3Key, testLogoBuffer, testContentType);
      // Short delay to allow S3 eventual consistency if needed, though usually fast
      await new Promise(res => setTimeout(res, 100));
    }
  });

  afterEach(async () => {
    if (canRunSuite) {
      // Clean up test logo from S3
      console.log(`[Test Teardown] Deleting test logo from S3: ${testS3Key}`);
      await deleteFromS3(testS3Key);
      // Short delay
      await new Promise(res => setTimeout(res, 100));
    }
  });

  it('should retrieve an existing logo directly from S3', async () => {
    if (!canRunSuite) {
      console.log('Skipping S3 integration test: S3 environment variables not set');
      return;
    }
    console.log(`[Test Run] Calling getLogo for domain: ${testDomain}`);
    const result = await getLogo(testDomain);

    expect(result).not.toBeNull();
    if (!result) return; // Type guard

    expect(result.buffer).toBeInstanceOf(Buffer);
    // Compare buffer contents
    expect(result.buffer.equals(testLogoBuffer)).toBe(true);
    expect(result.contentType).toBe(testContentType);
    // Since we wrote the logo with testSource, we expect findLogoInS3 to identify it with that source.
    expect(result.source).toBe(testSource);

    // Verify that getLogo tried to fetch from cache first, then set the cache
    expect(mockGetLogoFetch).toHaveBeenCalledWith(testDomain);
    // getLogo should set the cache after fetching from S3
    expect(mockSetLogoFetch).toHaveBeenCalledWith(testDomain, expect.objectContaining({
      buffer: testLogoBuffer,
      source: testSource,
    }));
  });

  it('should return null if logo does not exist in S3 and external fetch fails (or is skipped)', async () => {
     if (!canRunSuite) {
       console.log('Skipping S3 integration test: S3 environment variables not set');
       return;
     }
     // Ensure the test logo for *this* domain is deleted if somehow left over
     const nonExistentDomain = "nonexistent-domain-for-s3.com";
     const nonExistentKeyPng = getTestLogoS3Key(nonExistentDomain, 'google', 'png');
     const nonExistentKeySvg = getTestLogoS3Key(nonExistentDomain, 'google', 'svg');
     await deleteFromS3(nonExistentKeyPng);
     await deleteFromS3(nonExistentKeySvg);
     // Clear/reset mocks
     clearLogoFetchCache();
     // Simulate cache miss
     mockGetLogoFetch.mockReturnValue(undefined);

     console.log(`[Test Run] Calling getLogo for non-existent domain: ${nonExistentDomain}`);
     const result = await getLogo(nonExistentDomain);

     expect(result).toBeNull();
  });

});
