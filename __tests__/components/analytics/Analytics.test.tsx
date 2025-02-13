/**
 * Analytics Component Tests
 * @module __tests__/components/analytics/Analytics
 * @description
 * Tests for the Analytics component, verifying script loading,
 * event tracking, and error handling.
 *
 * Related modules:
 * @see {@link "components/analytics/Analytics"} - Component being tested
 * @see {@link "lib/analytics/queue"} - Queue system for handling analytics events
 * @see {@link "docs/architecture/analytics.md"} - Analytics architecture documentation
 */

import { render, waitFor } from '@testing-library/react';
import { Analytics } from '@/components/analytics/Analytics';
import { usePathname } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}));

// Mock window.location
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: {
      pathname: '/test',
      href: 'https://test.com/test',
    },
    writable: true
  });
});

// Mock next/script
jest.mock('next/script', () => {
  return function Script(props: any) {
    // Call onLoad immediately to simulate script loading
    props.onLoad?.();
    return <script {...props} />;
  };
});

// Mock document.referrer
beforeAll(() => {
  Object.defineProperty(document, 'referrer', {
    value: 'https://test.com/referrer',
    configurable: true
  });
});

// Setup mock analytics functions
beforeEach(() => {
  // Setup Umami mock
  const umamiTrackFn = jest.fn();
  window.umami = Object.assign(
    (event: string, data?: Record<string, unknown>) => {
      umamiTrackFn(event, data);
    },
    { track: umamiTrackFn }
  );

  // Setup Plausible mock
  window.plausible = jest.fn();
});

describe('Analytics Component', () => {
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: 'test-id',
      NEXT_PUBLIC_SITE_URL: 'https://test.com'
    };

    // Mock pathname
    (usePathname as jest.Mock).mockReturnValue('/test');

    // Mock fetch for IP endpoint
    global.fetch = jest.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('127.0.0.1'),
        ok: true
      } as Response)
    );

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Clean up window globals
    delete (window as any).plausible;
    delete (window as any).umami;
  });

  describe('Script Loading', () => {
    it('loads analytics scripts with correct attributes', () => {
      const { container } = render(<Analytics />);

      // Check Umami script
      const umamiScript = container.querySelector('script#umami') as HTMLScriptElement;
      expect(umamiScript).toBeInTheDocument();
      expect(umamiScript.getAttribute('src')).toBe('https://umami.iocloudhost.net/script.js');
      expect(umamiScript.getAttribute('data-website-id')).toBe('test-id');

      // Check Plausible script
      const plausibleScript = container.querySelector('script#plausible') as HTMLScriptElement;
      expect(plausibleScript).toBeInTheDocument();
      expect(plausibleScript.getAttribute('src')).toBe('https://plausible.iocloudhost.net/js/script.js');
      expect(plausibleScript.getAttribute('data-domain')).toBe('test.com');
    });

    it('handles missing environment variables', () => {
      delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
      const { container } = render(<Analytics />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Event Tracking', () => {
    it('tracks pageview on route change', async () => {
      render(<Analytics />);

      // Wait for tracking calls
      await waitFor(() => {
        expect(window.plausible).toHaveBeenCalledWith('pageview', expect.objectContaining({
          props: expect.objectContaining({
            path: '/test'
          })
        }));
        expect(window.umami.track).toHaveBeenCalledWith('pageview', expect.objectContaining({
          path: '/test'
        }));
      });
    });

    it('normalizes blog paths for tracking', async () => {
      (usePathname as jest.Mock).mockReturnValue('/blog/test-post');
      render(<Analytics />);

      await waitFor(() => {
        expect(window.plausible).toHaveBeenCalledWith('pageview', expect.objectContaining({
          props: expect.objectContaining({
            path: '/blog/:slug'
          })
        }));
      });
    });
  });

  describe('Error Handling', () => {
    it('handles Plausible tracking errors', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Tracking failed');

      // Mock fetch to throw error
      global.fetch = jest.fn(() => Promise.reject(error));

      render(<Analytics />);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Plausible tracking error:', error);
      });

      consoleError.mockRestore();
    });

    it('handles Umami tracking errors', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Tracking failed');

      // Mock Umami to throw error
      const trackFn = jest.fn().mockImplementation(() => {
        throw error;
      });
      window.umami = Object.assign(
        (event: string, data?: Record<string, unknown>) => {
          trackFn(event, data);
        },
        { track: trackFn }
      );

      render(<Analytics />);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Umami tracking error:', error);
      });

      consoleError.mockRestore();
    });
  });

  describe('Debug Logging', () => {
    it('logs script status on route change', async () => {
      const consoleDebug = jest.spyOn(console, 'debug').mockImplementation();
      render(<Analytics />);

      await waitFor(() => {
        expect(consoleDebug).toHaveBeenCalledWith(
          '[Analytics Debug] Script status:',
          expect.objectContaining({
            umamiLoaded: true,
            plausibleLoaded: true,
            path: '/test'
          })
        );
      });

      consoleDebug.mockRestore();
    });
  });
});
