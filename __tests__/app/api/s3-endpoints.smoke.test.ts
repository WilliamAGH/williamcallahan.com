// __tests__/app/api/s3-endpoints.smoke.test.ts
import { describe, it, expect } from 'bun:test';
import type { UnifiedBookmark, GitHubActivityApiResponse } from '@/types'; // Import types for structure check

// Base URL for the running application - Ensure this matches your dev server
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

describe('API Endpoint Smoke Tests (Requires Running Server with S3 Config)', () => {

  it.skip('GET /api/bookmarks should return a successful response with bookmark data', async () => {
    const url = `${BASE_URL}/api/bookmarks`;
    let response: Response | null = null;
    let data: UnifiedBookmark[] | null = null;
    let error: Error | null = null;

    console.log(`[Smoke Test] Fetching: ${url}`);
    try {
      // Add a timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25-second timeout

      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId); // Clear timeout if fetch completes

      if (response.ok) {
        data = await response.json() as UnifiedBookmark[];
      } else {
        console.error(`[Smoke Test] Failed response status for ${url}: ${response.status} ${response.statusText}`);
        try {
          const errorBody = await response.text();
           console.error(`[Smoke Test] Failed response body: ${errorBody.substring(0, 500)}...`); // Log truncated body
         } catch (bodyError) {
           // Safely handle unknown error type for logging
           const errorMsg = bodyError instanceof Error ? bodyError.message : String(bodyError);
           console.error(`[Smoke Test] Could not read error body: ${errorMsg}`);
         }
       }
    } catch (fetchError) {
      console.error(`[Smoke Test] Fetch error for ${url}:`, fetchError);
      error = fetchError as Error;
    }

    // Assertions
    expect(error).toBeNull(); // Should not throw a fetch error
    expect(response).not.toBeNull(); // Should have received a response object
    expect(response?.ok).toBe(true); // Response status should be 2xx
    expect(data).not.toBeNull(); // Should have received data
    expect(Array.isArray(data)).toBe(true); // Data should be an array

    // Optional: Check structure of the first item if data exists
    if (data && data.length > 0) {
      const firstBookmark = data[0];
      expect(firstBookmark).toHaveProperty('id');
      expect(firstBookmark).toHaveProperty('url');
      expect(firstBookmark).toHaveProperty('title');
      expect(firstBookmark).toHaveProperty('tags');
      expect(Array.isArray(firstBookmark.tags)).toBe(true);
      console.log(`[Smoke Test] GET /api/bookmarks returned ${data.length} items. First item ID: ${firstBookmark.id}`);
    } else {
      console.warn("[Smoke Test] /api/bookmarks returned an empty array. Test passed, but check if data is expected.");
    }
  }, 30000); // Test timeout

  it.skip('GET /api/github-activity should return a successful response with activity data', async () => {
    const url = `${BASE_URL}/api/github-activity`;
    let response: Response | null = null;
    let data: GitHubActivityApiResponse | null = null;
    let error: Error | null = null;

    console.log(`[Smoke Test] Fetching: ${url}`);
    try {
       // Add a timeout controller
       const controller = new AbortController();
       const timeoutId = setTimeout(() => controller.abort(), 25000); // 25-second timeout

       response = await fetch(url, { signal: controller.signal });
       clearTimeout(timeoutId); // Clear timeout if fetch completes

      if (response.ok) {
        data = await response.json() as GitHubActivityApiResponse;
      } else {
        console.error(`[Smoke Test] Failed response status for ${url}: ${response.status} ${response.statusText}`);
         try {
           const errorBody = await response.text();
           console.error(`[Smoke Test] Failed response body: ${errorBody.substring(0, 500)}...`); // Log truncated body
         } catch (bodyError) {
           // Safely handle unknown error type for logging
           const errorMsg = bodyError instanceof Error ? bodyError.message : String(bodyError);
           console.error(`[Smoke Test] Could not read error body: ${errorMsg}`);
         }
       }
    } catch (fetchError) {
      console.error(`[Smoke Test] Fetch error for ${url}:`, fetchError);
      error = fetchError as Error;
    }

    // Assertions
    expect(error).toBeNull();
    expect(response).not.toBeNull();
    expect(response?.ok).toBe(true);
    expect(data).not.toBeNull();

    // Check structure
    expect(data).toHaveProperty('source');
    // The source should reflect the origin when the data was fetched/stored, not 'cache' itself.
    expect(['api', 'scraping', 'api_multi_file_cache']).toContain(data?.source);
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data?.data)).toBe(true);
    expect(data).toHaveProperty('totalContributions');
    expect(typeof data?.totalContributions).toBe('number');
    expect(data).toHaveProperty('dataComplete');
    expect(typeof data?.dataComplete).toBe('boolean');

    if (data?.data && data.data.length > 0) {
      const firstDay = data.data[0];
      expect(firstDay).toHaveProperty('date');
      expect(firstDay).toHaveProperty('count');
      expect(firstDay).toHaveProperty('level');
      console.log(`[Smoke Test] GET /api/github-activity returned source: ${data.source}, days: ${data.data.length}, complete: ${data.dataComplete}`);
    } else {
       console.warn("[Smoke Test] /api/github-activity returned no contribution days. Test passed, but check if data is expected.");
    }
  }, 30000); // Test timeout

});
