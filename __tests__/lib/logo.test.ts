import { fetchLogo, clearLogoCache } from '../../lib/logo';
import { ENDPOINTS } from '../../lib/constants';

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.Mock;

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('Logo Fetching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should fetch logo for a domain', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/logo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://www.google.com/s2/favicons?domain=example.com&size=128',
            source: 'google'
          })
        });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await fetchLogo('example.com');
    expect(result.source).toBe('google');
  });

  it('should handle failed logo fetches', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: false,
      status: 404
    }));

    const result = await fetchLogo('example.com');
    expect(result.url).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('should use cache when available', async () => {
    const cachedData = {
      'example.com': {
        url: 'https://example.com/logo.png',
        source: 'google',
        timestamp: Date.now()
      }
    };
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(cachedData));

    const result = await fetchLogo('example.com');
    expect(result.url).toBe('https://example.com/logo.png');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle company names', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/logo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://www.google.com/s2/favicons?domain=example.com&size=128',
            source: 'google'
          })
        });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await fetchLogo('Example Company');
    expect(result.source).toBe('google');
  });

  it('should handle full URLs', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/logo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://www.google.com/s2/favicons?domain=example.com&size=128',
            source: 'google'
          })
        });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await fetchLogo('https://example.com/path');
    expect(result.source).toBe('google');
  });

  it('should handle API errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchLogo('example.com');
    expect(result.url).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('should handle localStorage errors gracefully', async () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error('Storage error');
    });

    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/logo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://www.google.com/s2/favicons?domain=example.com&size=128',
            source: 'google'
          })
        });
      }
      return Promise.resolve({ ok: true });
    });

    const result = await fetchLogo('example.com');
    expect(result.source).toBe('google');
  });

  it('should clear cache', () => {
    clearLogoCache();
    expect(mockLocalStorage.removeItem).toHaveBeenCalled();
  });
});
