import { act } from '@testing-library/react';

/**
 * Environment-aware wrapper for React's act()
 * Uses proper act() from @testing-library/react which handles both
 * synchronous and asynchronous updates in a consistent way.
 *
 * Note: We use @testing-library/react's act() implementation as it's the
 * recommended approach and handles edge cases better than react-dom/test-utils.
 */
export { act };

// Export a type for better TypeScript support
export type Act = typeof act;
