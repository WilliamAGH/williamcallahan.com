/**
 * Analytics Type Definitions
 * @module types/analytics
 * @description
 * Type definitions for analytics tracking system. Includes types for both
 * Plausible and Umami analytics, as well as the shared queue system.
 *
 * Related modules:
 * @see {@link "components/analytics/Analytics"} - Main analytics component
 * @see {@link "lib/analytics/queue"} - Queue system for handling analytics events
 * @see {@link "public/scripts/plausible-init.js"} - Plausible initialization
 */

/**
 * Base analytics event data structure
 * @see https://umami.is/docs/tracker-functions
 * @see https://plausible.io/docs/custom-event-goals */
export interface BaseAnalyticsEvent {
  /** Current page path (normalized for dynamic routes) */
  path: string;
  /** Full page URL */
  url: string;
  /** Page referrer */
  referrer: string;
}

/**
 * Umami-specific event data
 */
export interface UmamiEvent extends BaseAnalyticsEvent {
  /** Website ID for tracking */
  website?: string;
  /** Current hostname */
  hostname?: string;
}

/**
 * Plausible-specific event data
 */
export interface PlausibleEvent extends BaseAnalyticsEvent {
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * Analytics provider type
 */
export type AnalyticsProvider = 'plausible' | 'umami';

/**
 * Analytics event type
 */
export type AnalyticsEventType = 'pageview';

/**
 * Plausible analytics function type
 */
export type PlausibleTracker = {
  (eventName: string, options?: { props: Record<string, unknown> }): void;
  q?: Array<[string, { props: Record<string, unknown> }]>;
};

/**
 * Umami analytics object type
 */
export type UmamiTracker = {
  track: (eventName: string, eventData?: Record<string, unknown>) => void;
} & {
  (event: string, data?: Record<string, unknown>): void;
};

declare global {
  interface Window {
    plausible?: PlausibleTracker;
    umami?: UmamiTracker;
  }
}
