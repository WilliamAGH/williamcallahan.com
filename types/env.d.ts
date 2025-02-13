/**
 * Global Type Declarations
 * @module types/env
 * @description
 * Global type declarations for the application, including window extensions
 * for analytics providers.
 *
 * Related modules:
 * @see {@link "types/analytics"} - Analytics type definitions
 */

import type { PlausibleTracker, UmamiTracker } from './analytics';

declare global {
  interface Window {
    /** Plausible analytics function */
    plausible: PlausibleTracker;
    /** Umami analytics object */
    umami: UmamiTracker;
  }
}

// Ensure this file is treated as a module
export {};
