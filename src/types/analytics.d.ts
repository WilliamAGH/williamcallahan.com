/**
 * Analytics Types
 *
 * SCOPE: Third-party analytics integration types and event structures
 * USAGE: Use for analytics providers (Umami, Plausible, Clicky) and tracking events
 * OVERLAP PREVENTION: Do NOT add general event/interaction types here - use component-types.ts
 * DO NOT add custom application events - this is only for third-party provider APIs
 */

/**
 * Internal Umami analytics API interface
 * @internal - Global window interface only
 */
interface UmamiAnalytics {
  track: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Internal Plausible analytics API interface
 * @internal - Global window interface only
 */
type PlausibleAnalytics = (event: string, options?: { props?: Record<string, unknown> }) => void;

/**
 * Base analytics event structure for tracking page interactions
 * @public - Used by client components for event tracking
 * @scope - Common fields shared by all analytics providers
 * @see https://umami.is/docs/tracker-functions
 * @see https://plausible.io/docs/custom-event-goals
 */
export interface BaseAnalyticsEvent {
  /** Current page path (normalized for dynamic routes) */
  path: string;
  /** Full page URL */
  url: string;
  /** Page referrer */
  referrer: string;
}

/**
 * Umami-specific event data structure
 * @public - Used for Umami analytics integration
 * @extends BaseAnalyticsEvent
 * @usage - Pass to Umami tracking functions
 */
export interface UmamiEvent extends BaseAnalyticsEvent {
  /** Website ID for tracking */
  website?: string;
  /** Current hostname */
  hostname?: string;
  /** Allow additional properties for event data compatibility */
  [key: string]: unknown;
}

/**
 * Plausible-specific event data structure
 * @public - Used for Plausible analytics integration
 * @extends BaseAnalyticsEvent
 * @usage - Pass to Plausible tracking functions
 */
export interface PlausibleEvent extends BaseAnalyticsEvent {
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * Twitter widgets API interface
 * @description Type definitions for the global `twttr` object from Twitter's widgets.js
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/javascript-api/overview
 */

interface Twttr {
  widgets: {
    createTweet(
      tweetId: string,
      element: HTMLElement,
      options: Record<string, unknown>,
    ): Promise<HTMLElement | undefined>;
    load(element?: HTMLElement): void;
  };
}

declare global {
  var umami: UmamiAnalytics | undefined;

  interface Window {
    umami?: UmamiAnalytics;
    plausible?: PlausibleAnalytics;
    clicky?: {
      pageview: (path: string) => void;
      // Add other Clicky methods if needed
    };
    twttr?: Twttr;
  }
}
