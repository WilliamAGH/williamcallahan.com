// __tests__/lib/setup/matchMedia.ts

/**
 * Mock implementation for window.matchMedia
 */

export const mockMatchMedia = (matches: boolean) => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
};