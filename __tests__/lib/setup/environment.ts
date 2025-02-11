/**
 * Environment Setup
 *
 * CRITICAL: This file must be loaded first to set up the test environment.
 * It sets up Node environment variables and timezone before any other setup.
 *
 * Order of operations:
 * 1. environment.ts (this file) - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. jest.setup.ts - Sets up test utilities and mocks
 * 5. react.ts - Sets up React and Testing Library
 */

// Set up environment variables using Object.defineProperty to handle read-only properties
Object.defineProperty(process.env, 'NODE_ENV', { value: 'development' });
Object.defineProperty(process.env, 'TZ', { value: 'America/Los_Angeles' });
Object.defineProperty(process.env, 'NEXT_PUBLIC_SITE_URL', { value: 'https://williamcallahan.com' });

// Export timezone helpers for tests that need to work with different times
export const mockPacificTime = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  // Create date in local timezone
  const localDate = new Date(year, month - 1, day);
  // Convert to Pacific time string
  return localDate.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// Export timezone constants for tests
export const PACIFIC_TIMEZONE = 'America/Los_Angeles';
export const PST_OFFSET = '-08:00';
export const PDT_OFFSET = '-07:00';
