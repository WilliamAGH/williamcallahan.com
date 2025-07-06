/**
 * Content Security Policy (CSP) Directives
 *
 * This file contains the Content Security Policy (CSP) directives for the application.
 * It is used by the middleware to set the Content-Security-Policy header.
 *
 * @module config/csp
 */

export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    "https://scripts.simpleanalyticscdn.com",
    "https://static.getclicky.com",
    "https://in.getclicky.com",
    "https://platform.twitter.com",
    "https://*.x.com",
    "blob:",
  ],
  connectSrc: [
    "'self'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://queue.simpleanalyticscdn.com",
    "https://in.getclicky.com",
    "https://react-tweet.vercel.app",
    "https://*.twitter.com",
    "https://twitter.com",
    "https://platform.twitter.com",
    "https://*.x.com",
  ],
  workerSrc: ["'self'", "blob:"],
  imgSrc: [
    "'self'",
    "data:",
    "https://pbs.twimg.com",
    "https://*.twimg.com",
    "https://react-tweet.vercel.app",
    "https:",
  ],
  styleSrc: ["'self'", "'unsafe-inline'", "https://platform.twitter.com", "https://*.twimg.com", "https://*.x.com"],
  fontSrc: ["'self'", "data:", "https://platform.twitter.com", "https://*.twimg.com", "https://*.x.com"],
  frameSrc: ["https://platform.twitter.com", "https://*.x.com"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};
