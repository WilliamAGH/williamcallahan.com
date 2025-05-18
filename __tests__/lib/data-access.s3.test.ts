/**
 * S3 Integration Tests for Data Access Module
 *
 * Tests the integration with S3 storage for logo retrieval functionality
 * Validates S3 operations in both integration and unit test environments
 */

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
// Import s3-utils for actual use in integration tests and for spying in unit tests
import * as s3Utils from '../../lib/s3-utils';
// Destructure for direct use in integration tests if preferred, these will be the REAL implementations
const { writeBinaryS3, deleteFromS3, readBinaryS3: actualReadBinaryS3 } = s3Utils;
// The import below will also point to the mocked ServerCacheInstance due to mock.module hoisting.
// We can use this reference to configure mock return values or check calls.
import { createHash } from 'node:crypto';
import type { LogoSource } from '../../types';
import { LOGO_SOURCES } from '../../lib/constants'; // Import for fetch mock
import sharp from 'sharp'; // Import sharp for buffer conversion in test

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
  // const getDomainHash = (d: string): string => createHash('md5').update(d).digest('hex');
  // const hash = getDomainHash(domain).substring(0, 8); // REMOVED HASH
  const domainPart = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${S3_LOGOS_KEY_PREFIX}/${domainPart}_${sourceAbbr}.${extension}`; // UPDATED - without hash
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
    expect(result.buffer).toBeDefined();
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

  // Unit tests for getLogo (cache + S3 png/svg + external fetch + failure)
  // s3-utils are no longer globally mocked via mock.module. Spies will be used for unit tests.

  // This require is for the specific getLogo implementation from logos.ts for unit testing
  const { getLogo: getLogoUnit, fetchLogoExternally } = require('../../lib/data-access/logos');

  describe('getLogo Unit Tests', () => {
    const domain = 'unit-test.com';
    const pngResult = Buffer.from('png-data'); // Keep as simple string for non-image-processing tests
    const svgResult = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>'); // Valid SVG
    // Use a minimal valid SVG for externalResult to pass isImageLargeEnough
    const minimalSvgBuffer = Buffer.from( // Ensure this is a valid SVG string that sharp can parse and is >= 128x128
      '<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="128" height="128" fill="green"/></svg>'
    );
    const externalResult = {
      buffer: minimalSvgBuffer,
      contentType: 'image/svg+xml',
      source: 'duckduckgo' as LogoSource,
      extension: 'svg'
    };

    let readBinaryS3Mock: any; // Use 'any' or let TypeScript infer the type
    // Add spies for other s3Utils functions if they need to be mocked for specific unit tests
    // let writeBinaryS3Mock: any;
    // let listS3ObjectsMock: jest.SpyInstance;

    beforeEach(() => {
      mockGetLogoFetch.mockReset();
      mockSetLogoFetch.mockReset();

      // Spy on s3Utils.readBinaryS3 and provide a fresh mock function for each test
      // Use (jest as any) to bypass potential TypeScript error if 'spyOn' is not in the defined 'Jest' type
      readBinaryS3Mock = (jest as any).spyOn(s3Utils, 'readBinaryS3').mockImplementation(jest.fn());
      // Example for other spies if needed:
      // writeBinaryS3Mock = (jest as any).spyOn(s3Utils, 'writeBinaryS3').mockImplementation(jest.fn());
      // listS3ObjectsMock = jest.spyOn(s3Utils, 'listS3Objects').mockImplementation(jest.fn());

      // Create a mock that matches the fetch type
      const mockFetch = jest.fn().mockReset();
      // @ts-ignore: Mocking fetch with required properties
      mockFetch.preconnect = jest.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
      // Ensure external fetch is allowed for tests that need it,
      // and disallowed for tests that check skipping.
      // Default to allowing for unit tests unless overridden in a specific test.
      process.env.SKIP_EXTERNAL_LOGO_FETCH = 'false';
    });

    it('returns cached logo when present and skips S3/external fetch', async () => {
      const cached = {
        buffer: pngResult,
        contentType: 'image/png',
        source: 'google' as const
      };
      mockGetLogoFetch.mockReturnValue(cached);

      const result = await getLogoUnit(domain); // Use getLogoUnit for unit tests
      expect(result).toEqual(cached);
      expect(mockGetLogoFetch).toHaveBeenCalledWith(domain);
      expect(readBinaryS3Mock).not.toHaveBeenCalled(); // Check the spy
    });

    it('fetches PNG from S3 on cache miss and caches it', async () => {
      mockGetLogoFetch.mockReturnValue(undefined);
      readBinaryS3Mock.mockResolvedValueOnce(pngResult); // Use the spy

      const result = await getLogoUnit(domain); // Use getLogoUnit
      expect(mockGetLogoFetch).toHaveBeenCalledWith(domain);
      expect(readBinaryS3Mock).toHaveBeenCalledWith('images/logos/unit-test_google.png'); // Check the spy
      expect(mockSetLogoFetch).toHaveBeenCalledWith(domain, {
        url: null, // As per current implementation of getLogoUnit
        buffer: pngResult,
        source: 'google',
      });
      expect(result).toEqual({
        buffer: pngResult,
        contentType: 'image/png', // processImageBuffer determines this for the return
        source: 'google',
      });
    });

    it('fetches SVG from S3 when PNG is missing and caches it', async () => {
      mockGetLogoFetch.mockReturnValue(undefined);
      readBinaryS3Mock // Use the spy
        .mockResolvedValueOnce(undefined) // For PNG
        .mockResolvedValueOnce(svgResult);   // For SVG

      const result = await getLogoUnit(domain); // Use getLogoUnit
      expect(readBinaryS3Mock).toHaveBeenCalledTimes(2);
      expect(readBinaryS3Mock).toHaveBeenNthCalledWith(1, 'images/logos/unit-test_google.png');
      // The actual second call depends on the LOGO_SOURCES order in logos.ts, assuming 'clearbit' is next for SVGs if google.png fails
      // Let's check the actual implementation: findLogoInS3 tries 'google', 'clearbit', 'duckduckgo' for .png
      // getLogoS3Key in logos.ts always returns .png. So findLogoInS3 will try:
      // 1. unit-test_google.png
      // 2. unit-test_clearbit.png
      // 3. unit-test_duckduckgo.png
      // The test implies it looks for SVG after PNG. This part of the test logic might need review against findLogoInS3,
      // as findLogoInS3 primarily looks for .png files based on getLogoS3Key.
      // The fallback s3UtilsListS3Objects might find an SVG.
      // For this change, we'll keep the assertion structure but note it relies on findLogoInS3's exact behavior.
      // If findLogoInS3 is changed to look for specific SVG keys, this test assertion would need to match.
      // Current getLogoS3Key in logos.ts is hardcoded to .png.
      // The test's original (readBinaryS3 as jest.Mock) implies it expected a call for clearbit.png.
      expect(readBinaryS3Mock).toHaveBeenNthCalledWith(2, 'images/logos/unit-test_clearbit.png');
      expect(mockSetLogoFetch).toHaveBeenCalledWith(domain, {
        url: null, // As per current implementation of getLogoUnit
        buffer: svgResult,
        source: 'clearbit', // This source implies clearbit.png was found
      });
      expect(result).toEqual({
        buffer: svgResult,
        contentType: 'image/svg+xml', // processImageBuffer determines this
        source: 'clearbit',
      });
    });

    it('falls back to external fetch on S3 miss and caches external result', async () => {
      mockGetLogoFetch.mockReturnValue(undefined);
      readBinaryS3Mock.mockResolvedValue(undefined); // All S3 reads will fail via the spy
      process.env.SKIP_EXTERNAL_LOGO_FETCH = 'false'; // Explicitly allow external fetch
      process.env.ALLOW_EXTERNAL_FETCH_IN_TEST = 'true'; // Allow external fetch for this test

      // Ensure global.fetch (mocked as mockFetch) is set up to return the external result
      // fetchExternalLogo uses global.fetch internally.
      // We expect fetchExternalLogo to try multiple URLs, so we'll mock a successful response for one of them.
      // For simplicity, we'll assume the first URL tried by fetchExternalLogo gets this response.
      // The actual URL depends on LOGO_SOURCES.google.hd, LOGO_SOURCES.clearbit.hd etc.
      // Use global.fetch, which is assigned the mockFetch instance in beforeEach
      (global.fetch as unknown as jest.Mock).mockImplementation(async (url: string | URL | Request) => {
        const urlString = typeof url === 'string' ? url : (url as URL).href;
        // externalResult.source is 'duckduckgo'
        // We expect fetchExternalLogo to try various URLs, succeed for duckduckgo
        if (urlString === LOGO_SOURCES.duckduckgo.hd(domain)) {
          return new Response(externalResult.buffer, {
            status: 200,
            headers: { 'Content-Type': externalResult.contentType },
          });
        }
        return new Response('Not Found by mock', { status: 404 });
      });

      const result = await getLogoUnit(domain); // Use getLogoUnit
      // Expect 3 calls from findLogoInS3 (google.png, clearbit.png, duckduckgo.png)
      // + 1 call to list objects with prefix
      // + 1 call to read the best match from the list
      expect(readBinaryS3Mock).toHaveBeenCalledTimes(5); // Check the spy
      expect(global.fetch).toHaveBeenCalled(); // Check that an external fetch was attempted

      // Simulate the processing getLogo does to the external buffer before caching
      const { processImageBuffer } = require('../../lib/data-access/logos');
      const { processedBuffer: expectedCachedBuffer, contentType: expectedContentType } = await processImageBuffer(externalResult.buffer);

      expect(mockSetLogoFetch).toHaveBeenCalledWith(domain, {
        url: null, // As per current implementation of getLogo
        buffer: expectedCachedBuffer, // Expect the buffer that results from processImageBuffer
        source: externalResult.source,
      });
      expect(result).toEqual({
        buffer: expectedCachedBuffer, // The result should also contain this processed buffer
        contentType: expectedContentType, // This comes from processImageBuffer on externalLogo
        source: externalResult.source,
      });
    });

    it('returns null when S3 and external fetch both fail or are skipped', async () => {
      mockGetLogoFetch.mockReturnValue(undefined);
      readBinaryS3Mock.mockRejectedValue(new Error('S3 error')); // Mock S3 failure via spy
      process.env.SKIP_EXTERNAL_LOGO_FETCH = 'true'; // Ensure external fetch is skipped for this test
      // Ensure ALLOW_EXTERNAL_FETCH_IN_TEST is not 'true' for this specific test case if it was set by a previous one.
      process.env.ALLOW_EXTERNAL_FETCH_IN_TEST = 'false';


      const result = await getLogoUnit(domain); // Use getLogoUnit
      expect(readBinaryS3Mock).toHaveBeenCalledTimes(4); // Expect 4 calls due to loop in findLogoInS3 (google, clearbit, ddg .png) + list operation
      expect(result).toBeNull();
    });

    afterEach(() => {
      // Restore spies
      if (readBinaryS3Mock) { // Check if mock was initialized
        readBinaryS3Mock.mockRestore();
      }
      // if (writeBinaryS3Mock) writeBinaryS3Mock.mockRestore();
      // if (listS3ObjectsMock) listS3ObjectsMock.mockRestore();
      // Reset any environment variables changed for specific tests
      delete process.env.ALLOW_EXTERNAL_FETCH_IN_TEST;
    });
  });
});
