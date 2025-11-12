/**
 * Content Security Policy (CSP) Directives
 *
 * This file contains the Content Security Policy (CSP) directives for the application.
 * It is used by the middleware to set the Content-Security-Policy header.
 *
 * @module config/csp
 */

const RAILWAY_TEST_DEPLOYMENTS = "https://*.up.railway.app";

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
    "'unsafe-eval'",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  connectSrc: [
    "'self'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://queue.simpleanalyticscdn.com",
    "https://scripts.simpleanalyticscdn.com",
    "https://in.getclicky.com",
    "https://react-tweet.vercel.app",
    "https://*.twitter.com",
    "https://twitter.com",
    "https://platform.twitter.com",
    "https://*.x.com",
    "https://*.callahan.cloud",
    "https://*.digitaloceanspaces.com",
    "https://*.sfo3.digitaloceanspaces.com",
    "https://williamcallahan-com.sfo3.digitaloceanspaces.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  workerSrc: ["'self'", "blob:"],
  imgSrc: [
    "'self'",
    "data:",
    "https://pbs.twimg.com",
    "https://*.twimg.com",
    "https://react-tweet.vercel.app",
    "https:",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  styleSrc: [
    "'self'",
    "https://platform.twitter.com",
    "https://*.twimg.com",
    "https://*.x.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  styleSrcAttr: ["'unsafe-inline'"],
  styleSrcElem: [
    "'unsafe-inline'",
    "'self'",
    "https://platform.twitter.com",
    "https://*.twimg.com",
    "https://*.x.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  fontSrc: [
    "'self'",
    "data:",
    "https://platform.twitter.com",
    "https://*.twimg.com",
    "https://*.x.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  frameSrc: ["https://platform.twitter.com", "https://*.x.com", RAILWAY_TEST_DEPLOYMENTS],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};
