/**
 * Tests for the Bookmarks API Route
 * @module __tests__/api/bookmarks/route.test
 */

import { describe, beforeEach, it, expect, afterEach } from 'bun:test';
import { GET } from '../../../../app/api/bookmarks/route';
import type { UnifiedBookmark } from '../../../../types';
import { NextRequest } from 'next/server'; // Import NextRequest

// Create a NextRequest object
function createRequest(options: { url?: string } = {}): NextRequest {
  const baseUrl = 'https://bookmark.iocloudhost.net/api/bookmarks';
  const url = options.url ? `${baseUrl}${options.url}` : baseUrl;
  // Cast to NextRequest. For more complex scenarios, you might need to mock specific NextRequest properties.
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...(process.env.BOOKMARK_BEARER_TOKEN
        ? { 'Authorization': `Bearer ${process.env.BOOKMARK_BEARER_TOKEN}` }
        : {})
    }
  });
}

describe('GET /api/bookmarks', () => {
  // These tests use the real APIs - no mocking
  // CAUTION: These tests will fail in CI environments if BOOKMARK_BEARER_TOKEN is not set.
  // Consider one of the following approaches to prevent CI failures:
  // 1. Skip tests conditionally: if (!process.env.BOOKMARK_BEARER_TOKEN) test.skip('test description', ...)
  // 2. Use mock responses in CI: if (!process.env.BOOKMARK_BEARER_TOKEN) { /* setup mock */ }
  // 3. Fail early with clear message: if (!process.env.BOOKMARK_BEARER_TOKEN) throw new Error('BOOKMARK_BEARER_TOKEN required')

  it('should fetch bookmarks from the real API endpoint', async () => {
    // Actual request to the real endpoint
    const request = createRequest();

    // Call the actual API handler
    const response = await GET(request);

    // Verify response is successful
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    // Verify response contains valid bookmarks data
    const bookmarks = await response.json() as UnifiedBookmark[];
    expect(Array.isArray(bookmarks)).toBe(true);

    // If bookmarks were returned, validate their structure
    if (bookmarks.length > 0) {
      const bookmark = bookmarks[0];

      // Verify bookmark has required properties from UnifiedBookmark
      expect(bookmark).toHaveProperty('id');
      expect(bookmark).toHaveProperty('url');

      // Title might be null for some bookmarks, but should exist as a property
      expect(bookmark).toHaveProperty('title');

      // Verify tags array exists
      expect(bookmark).toHaveProperty('tags');
      expect(Array.isArray(bookmark.tags)).toBe(true);

      // Should have a date property
      expect(bookmark).toHaveProperty('dateBookmarked');

      // Content property should exist for most bookmarks
      if (bookmark.content) {
        expect(bookmark.content).toHaveProperty('url');
      }
    }

    // Log number of bookmarks for debugging (helpful for CI)
    console.log(`Fetched ${bookmarks.length} bookmarks from real API`);
  });

  it('should handle request with refresh parameter', async () => {
    // Create a real request with the refresh parameter
    const request = createRequest({ url: '?refresh=true' });

    // Call the API handler with the refresh parameter
    const response = await GET(request);

    // Verify the response is successful
    expect(response.status).toBe(200);

    const bookmarks = await response.json() as UnifiedBookmark[];
    expect(Array.isArray(bookmarks)).toBe(true);

    // With real data, we can't predict count, but we can verify structure
    if (bookmarks.length > 0) {
      const bookmark = bookmarks[0];
      expect(bookmark).toHaveProperty('id');
      expect(bookmark).toHaveProperty('url');
    }
  });

  // Test using a request with search parameters
  it('should handle search parameters properly', async () => {
    // Create a NextRequest with search parameters
    const request = new NextRequest('https://bookmark.iocloudhost.net/api/bookmarks?limit=5', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(process.env.BOOKMARK_BEARER_TOKEN
          ? { 'Authorization': `Bearer ${process.env.BOOKMARK_BEARER_TOKEN}` }
          : {})
      }
    });

    // Call the API endpoint
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // We should get bookmarks data back
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    // We can't guarantee exactly 5 bookmarks, but we can check that data is returned
    // and follows the expected structure
    if (data.length > 0) {
      const bookmark = data[0];
      expect(bookmark).toHaveProperty('id');
      expect(bookmark).toHaveProperty('url');
    }
  });
});
