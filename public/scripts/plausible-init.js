/**
 * Plausible Analytics Initialization Script
 * @module public/scripts/plausible-init
 * @description
 * Initializes Plausible Analytics with queue support, allowing events to be
 * queued before the main script loads. This ensures no events are lost during
 * script initialization.
 *
 * Related modules:
 * @see {@link "components/analytics/Analytics"} - Main analytics component
 * @see {@link "lib/analytics/queue"} - Queue system for handling analytics events
 * @see {@link "types/analytics"} - Analytics type definitions
 *
 * @example
 * // Events can be tracked before the main script loads:
 * window.plausible('pageview', { props: { path: '/home' } })
 *
 * // Events are queued and processed when the script loads
 */

// Initialize plausible with queue support
window.plausible = window.plausible || function() {
  // Create queue if it doesn't exist
  (window.plausible.q = window.plausible.q || []).push(arguments);
};
