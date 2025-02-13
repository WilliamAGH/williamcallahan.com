/**
 * Analytics Test Setup
 * @module __tests__/lib/setup/analytics
 * @description
 * Provides mock implementations and utilities for testing analytics functionality.
 *
 * Related modules:
 * @see {@link "components/analytics/Analytics"} - Analytics component
 * @see {@link "types/analytics"} - Analytics type definitions
 */

import type { PlausibleTracker, UmamiTracker } from '@/types/analytics';

/**
 * Create a mock Umami tracker
 * @returns Mock Umami tracker with both function and object interface
 */
export function createMockUmamiTracker(): UmamiTracker {
  const trackFn = jest.fn();
  return Object.assign(
    (event: string, data?: Record<string, unknown>) => {
      trackFn(event, data);
    },
    { track: trackFn }
  ) as UmamiTracker;
}

/**
 * Create a mock Plausible tracker
 * @returns Mock Plausible tracker with queue support
 */
export function createMockPlausibleTracker(): PlausibleTracker {
  const trackFn = jest.fn();
  return Object.assign(trackFn, { q: [] }) as PlausibleTracker;
}

/**
 * Setup analytics mocks for testing
 * @param options - Configuration options for mocks
 */
export function setupAnalyticsMocks(options: {
  plausibleError?: Error;
  umamiError?: Error;
} = {}) {
  // Store original properties
  const originalPlausible = (window as any).plausible;
  const originalUmami = (window as any).umami;

  if (options.plausibleError) {
    (window as any).plausible = jest.fn().mockImplementation(() => {
      throw options.plausibleError;
    });
  } else {
    (window as any).plausible = createMockPlausibleTracker();
  }

  if (options.umamiError) {
    const trackFn = jest.fn().mockImplementation(() => {
      throw options.umamiError;
    });
    (window as any).umami = Object.assign(
      (event: string, data?: Record<string, unknown>) => {
        trackFn(event, data);
      },
      { track: trackFn }
    ) as UmamiTracker;
  } else {
    (window as any).umami = createMockUmamiTracker();
  }

  // Return cleanup function
  return () => {
    if (originalPlausible === undefined) {
      delete (window as any).plausible;
    } else {
      (window as any).plausible = originalPlausible;
    }

    if (originalUmami === undefined) {
      delete (window as any).umami;
    } else {
      (window as any).umami = originalUmami;
    }
  };
}
