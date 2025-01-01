/**
 * Logo Management Tests
 * Tests for the logo fetching and caching functionality
 */

import { fetchLogo, clearLogoCache } from '../../lib/logo';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = jest.fn();

describe('Logo Fetching', () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    clearLogoCache();

    // Default successful fetch mock
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });
  });

  it('should fetch logo for a domain', async () => {
    const result = await fetchLogo('example.com');
    expect(result).toHaveProperty('url');
    expect(['google', 'duckduckgo', 'fallback']).toContain(result.source);
  });

  it('should handle company names', async () => {
    const result = await fetchLogo('Example Company');
    expect(result).toHaveProperty('url');
    expect(['google', 'duckduckgo', 'fallback']).toContain(result.source);
  });

  it('should handle full URLs', async () => {
    const result = await fetchLogo('https://www.example.com');
    expect(result).toHaveProperty('url');
    expect(['google', 'duckduckgo', 'fallback']).toContain(result.source);
  });

  it('should use cache when available', async () => {
    const mockCache = {
      'example.com': {
        url: 'https://example.com/logo.png',
        timestamp: Date.now(),
      },
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockCache));

    const result = await fetchLogo('example.com');
    expect(result.url).toBe('https://example.com/logo.png');
  });

  it('should handle invalid inputs gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));
    const result = await fetchLogo('');
    expect(result).toHaveProperty('error');
    expect(['google', 'duckduckgo', 'fallback']).toContain(result.source);
  });

  it('should handle localStorage errors gracefully', async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    const result = await fetchLogo('example.com');
    expect(result).toHaveProperty('url');
    expect(['google', 'duckduckgo', 'fallback']).toContain(result.source);
  });

  it('should respect cache duration', async () => {
    const oldCache = {
      'example.com': {
        url: 'https://example.com/logo.png',
        timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old (expired)
      },
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(oldCache));

    await fetchLogo('example.com');
    expect(global.fetch).toHaveBeenCalled(); // Should fetch new logo since cache is expired
  });
});
