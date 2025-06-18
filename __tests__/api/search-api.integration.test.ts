/**
 * @file Integration tests for the search API endpoint
 * @description Tests GET /api/search/all for various queries and edge cases
 */

import { GET } from '@/app/api/search/all/route';

/**
 * @class MockNextRequest
 * @description Simplified mock of Next.js NextRequest for testing
 */
class MockNextRequest {
  url: string;

  /**
   * @param {string} url - Full simulated request URL
   */
  constructor(url: string) {
    this.url = url;
  }

  /**
   * @returns {URL} URL object from the request URL string
   */
  get nextUrl() {
    return new URL(this.url);
  }
}

describe('Search API: GET /api/search/all', () => {
  describe('API Endpoint Behavior', () => {
    /**
     * @description Should return 400 if query is empty
     */
    it('should return an empty array for an empty query', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/search/all?q=') as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    /**
     * @description Should return 400 if 'q' parameter is missing
     */
    it('should return a 400 error for a missing query parameter', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/search/all') as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    /**
     * @description Should handle valid query and return results
     */
    it('should process a valid search query and return results', async () => {
      const request = new MockNextRequest('http://localhost:3000/api/search/all?q=test') as any;
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);

      // Each result should have the required fields
      for (const result of data) {
        expect(result).toHaveProperty('label');
        expect(result).toHaveProperty('path');
        expect(typeof result.label).toBe('string');
        expect(typeof result.path).toBe('string');
      }
    });

    /**
     * @description Should handle queries with special characters
     */
    it('should handle queries with special characters', async () => {
      const specialQuery = encodeURIComponent('test & special <characters>');
      const request = new MockNextRequest(`http://localhost:3000/api/search/all?q=${specialQuery}`) as any;
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    /**
     * @description Should not crash on very long queries
     */
    it('should gracefully handle very long queries', async () => {
      const longQuery = 'a'.repeat(1000);
      const request = new MockNextRequest(
        `http://localhost:3000/api/search/all?q=${longQuery}`,
      ) as any;
      const response = await GET(request);
      const data = await response.json();

      // Should either handle it or return an error, but not crash
      expect([200, 400]).toContain(response.status);
      expect(data).toBeDefined();
    });

    /**
     * @description Should handle concurrent requests without failing
     */
    it('should successfully manage concurrent requests', async () => {
      const queries = ['test1', 'test2', 'test3'];
      const requests = queries.map(q =>
        GET(
          new MockNextRequest(
            `http://localhost:3000/api/search/all?q=${q}`,
          ) as any,
        ),
      );

      const responses = await Promise.all(requests);
      const results = await Promise.all(responses.map(r => r.json()));

      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // All results should be arrays
      for (const result of results) {
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });
});
