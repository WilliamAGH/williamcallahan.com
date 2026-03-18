/**
 * Site Identity Constants
 *
 * Canonical owner (SS1a) for the production hostname and subdomain detection
 * pattern used across environment resolution modules (DB write guard, Sentry).
 *
 * @module config/site-identity
 */

export const PRODUCTION_HOSTNAME = "williamcallahan.com";
export const SUBDOMAIN_PATTERN = /^([^.]+)\.williamcallahan\.com$/;
