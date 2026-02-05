/**
 * Content Security Policy (CSP) Directives
 *
 * This file contains the Content Security Policy (CSP) directives for the application.
 * It is used by the middleware to set the Content-Security-Policy header.
 *
 * @module config/csp
 *
 * @remarks
 * Self-hosted infrastructure domains (popos-sf1 through popos-sf7.com):
 * These hosts run various self-hosted services that this application depends on:
 * - AudioBookShelf (popos-sf3.com) - Personal reading library API and book cover images
 * - Media servers and content APIs
 * - Other self-hosted applications
 *
 * All subdomains of popos-sf1.com through popos-sf7.com are whitelisted in:
 * - connectSrc: For API requests to these services
 * - imgSrc: For loading images (book covers, thumbnails, etc.)
 * - next.config.ts remotePatterns: For Next.js Image Optimization
 */

const RAILWAY_TEST_DEPLOYMENTS = "https://*.up.railway.app";

// Clerk authentication domains
// @see https://clerk.com/docs/security/clerk-csp
const CLERK_DOMAINS = {
  // Clerk Frontend API and authentication endpoints
  api: ["https://*.clerk.accounts.dev", "https://*.clerk.com"],
  // Clerk user profile images and assets
  images: ["https://img.clerk.com", "https://images.clerk.dev"],
  // Clerk scripts and styles
  scripts: ["https://*.clerk.accounts.dev", "https://*.clerk.com"],
  // Clerk modals, sign-in popups, and embedded UI
  frames: ["https://*.clerk.accounts.dev", "https://*.clerk.com"],
};

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
    ...CLERK_DOMAINS.scripts,
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
    ...CLERK_DOMAINS.api,
    "https://*.callahan.cloud",
    "https://*.digitaloceanspaces.com",
    "https://*.sfo3.digitaloceanspaces.com",
    "https://williamcallahan-com.sfo3.digitaloceanspaces.com",
    "https://alpha.williamcallahan.com",
    "https://sandbox.williamcallahan.com",
    "https://dev.williamcallahan.com",
    "https://*.williamcallahan.com",
    "https://williamcallahancom-production.up.railway.app",
    // Self-hosted infrastructure (popos-sf1 through sf7) - AudioBookShelf, media servers, etc.
    "https://*.popos-sf1.com",
    "https://*.popos-sf2.com",
    "https://*.popos-sf3.com",
    "https://*.popos-sf4.com",
    "https://*.popos-sf5.com",
    "https://*.popos-sf6.com",
    "https://*.popos-sf7.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  workerSrc: ["'self'", "blob:"],
  imgSrc: [
    "'self'",
    "data:",
    "https://pbs.twimg.com",
    "https://*.twimg.com",
    "https://react-tweet.vercel.app",
    "https://queue.simpleanalyticscdn.com",
    ...CLERK_DOMAINS.images,
    "https://*.callahan.cloud",
    "https://*.digitaloceanspaces.com",
    "https://*.sfo3.digitaloceanspaces.com",
    "https://williamcallahan-com.sfo3.digitaloceanspaces.com",
    // Self-hosted infrastructure (popos-sf1 through sf7) - AudioBookShelf covers, media thumbnails, etc.
    "https://*.popos-sf1.com",
    "https://*.popos-sf2.com",
    "https://*.popos-sf3.com",
    "https://*.popos-sf4.com",
    "https://*.popos-sf5.com",
    "https://*.popos-sf6.com",
    "https://*.popos-sf7.com",
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://platform.twitter.com",
    "https://*.twimg.com",
    "https://*.x.com",
    ...CLERK_DOMAINS.scripts,
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  styleSrcAttr: ["'unsafe-inline'"],
  styleSrcElem: [
    "'unsafe-inline'",
    "'self'",
    "https://platform.twitter.com",
    "https://*.twimg.com",
    "https://*.x.com",
    ...CLERK_DOMAINS.scripts,
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
  frameSrc: [
    "https://platform.twitter.com",
    "https://*.x.com",
    ...CLERK_DOMAINS.frames,
    RAILWAY_TEST_DEPLOYMENTS,
  ],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};
