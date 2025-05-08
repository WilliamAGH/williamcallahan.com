// __tests__/lib/data-access.s3.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getLogo } from '@/lib/data-access';
import { writeBinaryS3, deleteFromS3 } from '@/lib/s3-utils';
import { ServerCacheInstance } from '@/lib/server-cache';
import { createHash } from 'node:crypto';
import type { LogoSource } from '@/types';

// Helper to calculate expected S3 key (mirroring logic in data-access)
const S3_LOGOS_KEY_PREFIX = 'data/images/logos';
function getTestLogoS3Key(domain: string, source: LogoSource, extension: string): string {
  const getDomainHash = (d: string): string => createHash('md5').update(d).digest('hex');
  const hash = getDomainHash(domain).substring(0, 8);
  const domainPart = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${S3_LOGOS_KEY_PREFIX}/${domainPart}_${hash}_${sourceAbbr}.${extension}`;
}

describe.skip('getLogo S3 Integration', () => {
  const testDomain = 's3testdomain.com';
  const testSource: LogoSource = 'google'; // Arbitrary source for testing
  const testExtension = 'png';
  const testS3Key = getTestLogoS3Key(testDomain, testSource, testExtension);
  const testLogoBuffer = Buffer.from('dummy-png-data-for-s3-test');
  const testContentType = 'image/png';

  // Mock fetchExternalLogo to ensure it's not called when data is in S3
  // We need to mock the module where fetchExternalLogo is defined if it's internal
  // For now, let's assume we can track if getLogo tries to fetch externally implicitly
  // by checking if it returns the S3 data correctly without error/fallback.
  // A more robust test could involve mocking fetchExternalLogo if needed.

  beforeEach(async () => {
    // Clear cache before each test - Use the correct method
    ServerCacheInstance.clearAllLogoFetches(); // Correct method name from server-cache.ts
    // Upload test logo to S3
    console.log(`[Test Setup] Writing test logo to S3: ${testS3Key}`);
    await writeBinaryS3(testS3Key, testLogoBuffer, testContentType);
    // Short delay to allow S3 eventual consistency if needed, though usually fast
    await new Promise(res => setTimeout(res, 100));
  });

  afterEach(async () => {
    // Clean up test logo from S3
    console.log(`[Test Teardown] Deleting test logo from S3: ${testS3Key}`);
    await deleteFromS3(testS3Key);
     // Short delay
     await new Promise(res => setTimeout(res, 100));
  });

  it('should retrieve an existing logo directly from S3', async () => {
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

    // Verify it came from S3 by checking cache state (optional)
    const cached = ServerCacheInstance.getLogoFetch(testDomain);
    expect(cached).toBeDefined();
    expect(cached?.buffer?.equals(testLogoBuffer)).toBe(true);
    expect(cached?.source).toBe(result.source); // Cache should reflect what was found
  });

  it('should return null if logo does not exist in S3 and external fetch fails (or is skipped)', async () => {
     // Ensure the test logo for *this* domain is deleted if somehow left over
     const nonExistentDomain = "nonexistent-domain-for-s3.com";
     const nonExistentKeyPng = getTestLogoS3Key(nonExistentDomain, 'google', 'png');
     const nonExistentKeySvg = getTestLogoS3Key(nonExistentDomain, 'google', 'svg');
     await deleteFromS3(nonExistentKeyPng);
     await deleteFromS3(nonExistentKeySvg);
     // Clear cache - Use the correct method
     ServerCacheInstance.clearAllLogoFetches(); // Clear cache - Use the correct method

     // Mock fetchExternalLogo to simulate failure
     // This requires knowing how fetchExternalLogo is imported/used in data-access
     // For simplicity here, we rely on getLogo returning null if findLogoInS3 fails
     // AND fetchExternalLogo also fails (which it should for a fake domain).

     console.log(`[Test Run] Calling getLogo for non-existent domain: ${nonExistentDomain}`);
     const result = await getLogo(nonExistentDomain);

     expect(result).toBeNull();
  });

});
