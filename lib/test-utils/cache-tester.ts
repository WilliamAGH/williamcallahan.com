import { ServerCacheInstance } from '../server-cache';

/**
 * Utility for testing cache functionality in API routes
 */
export class CacheTester {
  /**
   * Verifies a cache hit for the specified endpoint
   */
  static async verifyCacheHit(endpoint: string, params: Record<string, string> = {}): Promise<boolean> {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${endpoint}?${queryString}` : endpoint;

    const response1 = await fetch(fullUrl);
    if (!response1.ok) return false;
    let data1: unknown;
    try {
      data1 = await response1.clone().json();
    } catch {
      data1 = await response1.text();
    }
    const cacheStats1 = ServerCacheInstance.getStats();

    const response2 = await fetch(fullUrl);
    if (!response2.ok) return false;
    let data2: unknown;
    try {
      data2 = await response2.clone().json();
    } catch {
      data2 = await response2.text();
    }
    const cacheStats2 = ServerCacheInstance.getStats();

    // Verify same data returned
    const isDataSame = JSON.stringify(data1) === JSON.stringify(data2);
    // Verify second request was a cache hit (hits increased)
    const isCacheHit = cacheStats2.hits > cacheStats1.hits;

    return isDataSame && isCacheHit;
  }

  /**
   * Clears cache for specific keys or endpoints
   */
  static clearCacheFor(type: 'logo' | 'bookmarks' | 'github-activity'): void {
    switch (type) {
      case 'logo':
        try {
          ServerCacheInstance.clearAllLogoFetches();
        } catch (error) {
          console.warn('[CacheTester] Error clearing logo cache:', error);
        }
        break;
      case 'bookmarks':
        try {
          ServerCacheInstance.clearBookmarks();
        } catch (error) {
          console.warn('[CacheTester] Error clearing bookmarks cache:', error);
        }
        break;
      case 'github-activity':
        try {
          ServerCacheInstance.clearGithubActivity();
        } catch (error) {
          console.warn('[CacheTester] Error clearing GitHub activity cache:', error);
        }
        break;
      default:
        // This ensures that all possible values of 'type' are handled in the switch statement.
        // If a new value is added to the union type of 'type', TypeScript will raise a
        // compile-time error here, prompting the developer to add a new 'case' for it.

        break;
    }
  }
}
