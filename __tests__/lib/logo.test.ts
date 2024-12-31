import { fetchLogo, clearLogoCache } from "../../lib/logo";
import type { LogoResult } from "../../types/logo";

// Mock window and localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
  } as Response)
);

describe("Logo Fetching", () => {
  beforeEach(() => {
    clearLogoCache();
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it("should fetch logo for a domain", async () => {
    const result = await fetchLogo("google.com");
    expect(result.url).toBeTruthy();
    expect(["duckduckgo", "fallback"]).toContain(result.source);
  });

  it("should handle company names", async () => {
    const result = await fetchLogo("Google");
    expect(result.url).toBeTruthy();
    expect(["duckduckgo", "fallback"]).toContain(result.source);
  });

  it("should handle full URLs", async () => {
    const result = await fetchLogo("https://www.microsoft.com");
    expect(result.url).toBeTruthy();
    expect(["duckduckgo", "fallback"]).toContain(result.source);
  });

  it("should use cache for subsequent requests", async () => {
    const firstResult = await fetchLogo("apple.com");
    expect(localStorageMock.setItem).toHaveBeenCalled();

    const secondResult = await fetchLogo("apple.com");
    expect(firstResult.url).toBe(secondResult.url);

    // Verify it was saved to localStorage
    expect(localStorageMock.getItem).toHaveBeenCalledWith("logo-cache");
  });

  it("should handle invalid inputs gracefully", async () => {
    // Mock fetch to simulate failure
    (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject("Network error"));
    
    const result = await fetchLogo("not-a-real-website-12345.com");
    expect(result.url).toBeTruthy();
    expect(result.source).toBe("fallback");
    expect(result.error).toBeTruthy();
  });

  it("should handle localStorage errors gracefully", async () => {
    // Mock localStorage to throw errors
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error("Storage error");
    });

    const result = await fetchLogo("example.com");
    expect(result.url).toBeTruthy();
    expect(["duckduckgo", "fallback"]).toContain(result.source);
  });

  it("should respect cache duration", async () => {
    // Mock Date.now to control time
    const now = Date.now();
    const realDateNow = Date.now.bind(global.Date);
    
    // Set initial time
    global.Date.now = jest.fn(() => now);
    
    // First request should cache
    await fetchLogo("test.com");
    expect(localStorageMock.setItem).toHaveBeenCalled();
    
    // Move time forward but within cache duration
    global.Date.now = jest.fn(() => now + (6 * 24 * 60 * 60 * 1000)); // 6 days
    
    // Second request should use cache
    await fetchLogo("test.com");
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
    
    // Move time forward beyond cache duration
    global.Date.now = jest.fn(() => now + (8 * 24 * 60 * 60 * 1000)); // 8 days
    
    // Third request should fetch fresh
    await fetchLogo("test.com");
    expect(global.fetch).toHaveBeenCalledTimes(2); // Called again
    
    // Restore Date.now
    global.Date.now = realDateNow;
  });
});
