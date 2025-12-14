/**
 * Nextjs Configuration
 * @module next.config
 * @description
 * Configuration file for Nextjs application settings including:
 * - Webpack customization for SVG handling
 * - Nodejs polyfills for API routes
 * - Image optimization settings
 * - Build output configuration
 * - Content Security Policy for scripts and images
 *
 * @see https://nextjs.org/docs/app/api-reference/next-config-js
 * @type {import('next').NextConfig}
 */

import { withSentryConfig } from "@sentry/nextjs";

/**
 * @typedef {{ version: string }} PackageJson
 */

/**
 * Get package version in a performant way
 * During build time, we can safely read the file synchronously
 * At runtime, we use the environment variable that was set during build
 */
function getPackageVersion(): string {
  // If already set from a previous run, use cached value
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }

  // During build time only, read package.json
  // This is acceptable because builds happen in a controlled environment
  // and this code doesn't run during request handling
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PHASE === "phase-production-build") {
    try {
      const { readFileSync } = require("node:fs");
      const { resolve } = require("node:path");
      const packageJson = JSON.parse(readFileSync(resolve("./package.json"), "utf8"));
      return packageJson.version;
    } catch {
      console.warn("[Next Config] Could not read package.json, using fallback version");
      return "0.0.0";
    }
  }

  // Development fallback
  return "0.0.0-dev";
}

/**
 * Get the current git hash
 * @returns {string} The git hash or a fallback string
 */
function getGitHash(): string {
  // Priority 1: Use environment variable if available (e.g., from CI/CD)
  // Railway and other platforms should set this during build
  if (process.env.GIT_HASH || process.env.NEXT_PUBLIC_GIT_HASH || process.env.RAILWAY_GIT_COMMIT_SHA) {
    const hash = process.env.GIT_HASH || process.env.NEXT_PUBLIC_GIT_HASH || process.env.RAILWAY_GIT_COMMIT_SHA || "";
    // Railway provides full SHA, truncate to short version
    return hash.slice(0, 7);
  }

  // Priority 2: For local development, try git command
  // This only works locally where git is available
  if (process.env.NODE_ENV === "development") {
    try {
      const { execSync } = require("node:child_process");
      const hash = execSync("git rev-parse --short HEAD").toString().trim();
      if (hash) {
        return hash;
      }
    } catch {
      // Git not available or not in a git repo
    }
  }

  // Priority 3: Use build-time generated hash if available
  // This should be set during the build process
  if (process.env.BUILD_ID) {
    return process.env.BUILD_ID.slice(0, 7);
  }

  // Final fallback: Use package version for production builds
  // This ensures we always have a meaningful release identifier
  const version = getPackageVersion();

  // For production, just use the version (no timestamp needed)
  // This is more stable and meaningful for release tracking
  if (process.env.NODE_ENV === "production") {
    return `v${version}`;
  }

  // For development, add timestamp for uniqueness
  const datePart = new Date().toISOString().split("T")[0];
  const timestamp = datePart ? datePart.replace(/-/g, "") : "00000000";
  return `v${version}-dev-${timestamp}`;
}

// Get version and cache it
const appVersion = getPackageVersion();
process.env.NEXT_PUBLIC_APP_VERSION = appVersion;

const gitHash = getGitHash();
process.env.NEXT_PUBLIC_GIT_HASH = gitHash;
process.env.SENTRY_RELEASE = gitHash;

const telemetryBundledPackages = [
  "resolve",
  "require-in-the-middle",
  "@opentelemetry/api",
  "@opentelemetry/instrumentation",
  "@opentelemetry/context-async-hooks",
];

const baseTranspilePackages = process.env.NODE_ENV === "production" ? ["next-mdx-remote", "swr"] : [];
const transpilePackages = Array.from(new Set([...baseTranspilePackages, ...telemetryBundledPackages]));

const CALLAHAN_IMAGE_HOSTS = [
  "s3-storage.callahan.cloud",
  "williamcallahan.com",
  "dev.williamcallahan.com",
  "alpha.williamcallahan.com",
  "*.williamcallahan.com",
  "*.callahan.cloud",
  "*.digitaloceanspaces.com",
  "*.sfo3.digitaloceanspaces.com",
];

const parseHostname = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//, "");
  }
};

const buildBucketHostname = (): string | null => {
  const bucket = process.env.S3_BUCKET?.trim();
  const serverUrl = process.env.S3_SERVER_URL?.trim();
  if (!bucket || !serverUrl) return null;

  const serverHost = parseHostname(serverUrl);
  if (!serverHost) return null;
  return `${bucket}.${serverHost}`;
};

const derivedCallahanHosts = [process.env.NEXT_PUBLIC_S3_CDN_URL, process.env.S3_CDN_URL, buildBucketHostname()]
  .map(parseHostname)
  .filter((hostname): hostname is string => Boolean(hostname));

const CDN_REMOTE_PATTERNS = Array.from(new Set([...CALLAHAN_IMAGE_HOSTS, ...derivedCallahanHosts])).map(hostname => ({
  protocol: "https",
  hostname,
  pathname: "/**",
}));

const nextConfig = {
  // We run our own rigorous validation pipeline (`bun run validate`).
  // TypeScript checks remain but eslint config is removed in Next.js 16
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * Ensure the data directory is included in traced output
   * so static data files are available in production
   */
  outputFileTracingIncludes: {
    "/": ["./data/**/*"],
  },

  /**
   * Turbopack configuration - Now default in Next.js 16
   * Consolidating all webpack functionality into Turbopack config
   */
  turbopack: {
    // Configure SVG handling for Turbopack
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
    // Configure module resolution extensions
    resolveExtensions: [".mdx", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
    // Module resolution aliases (migrated from webpack)
    resolveAlias: {
      // Fix SWR module resolution
      swr$: "./node_modules/swr/dist/index/index.js",
      "swr/infinite": "./node_modules/swr/infinite/dist/index.js",
      "swr/_internal": "./node_modules/swr/_internal/dist/index.js",
      // Fix hoist-non-react-statics for Sentry
      "hoist-non-react-statics$": "./node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js",
      // OpenTelemetry polyfill for Edge runtime
      "@opentelemetry/api": {
        browser: "./src/lib/edge-polyfills/opentelemetry.ts",
        edge: "./src/lib/edge-polyfills/opentelemetry.ts",
      },
      // Dev-only: AWS SDK stub
      ...(process.env.NODE_ENV === "development" ? { "@aws-sdk/client-s3": "./src/lib/stubs/aws-s3-stub.ts" } : {}),
    },
  },
  /**
   * Force Turbopack/Next to bundle the OTEL + Sentry dependency stack (and their nested `resolve` versions)
   * instead of trying to externalize them. This avoids the build-time "Package resolve can't be external"
   * warnings that happen because the project root uses `resolve@2.0.0-next.5` while Sentry's OTEL helpers
   * depend on `resolve@1.22.8`. Bundling keeps both versions isolated and silences the noisy warnings
   * without sacrificing server-side tracing or Sentry instrumentation.
   */
  transpilePackages,

  /**
   * Proxy Umami tracker and API through the same origin to avoid ad-blockers and CORS issues.
   * Docs: https://stasdeep.com/articles/umami-analytics
   */
  async rewrites() {
    return [
      {
        source: "/stats/:path*",
        destination: "https://umami.iocloudhost.net/:path*",
      },
      {
        source: "/api/send",
        destination: "https://umami.iocloudhost.net/api/send",
      },
    ];
  },

  // Webpack configuration removed in favor of Turbopack (Next.js 16 default)
  // All webpack functionality has been migrated to the turbopack config above
  // If you need webpack, add --webpack flag and restore the webpack config from git history

  /**
   * generateBuildId – CRITICAL ENV DIFFERENTIATION
   * ------------------------------------------------
   * • DEVELOPMENT: Returning `null` lets Next.js choose a random build ID on
   *   every `next dev` start.  This guarantees the chunk manifest aligns with
   *   freshly emitted JS files.  A fixed ID here WILL trigger ChunkLoadError
   *   when the dev server restarts but the browser cache keeps the old HTML.
   *
   * • PRODUCTION: We keep a deterministic ID (`v${appVersion}-stable`) so all
   *   servers share identical asset URLs, enabling long-term CDN caching and
   *   cache-tag purging.
   *
   * Never unify these paths: dev ≠ prod.  Breaking this contract re-opens the
   * regression we spent days chasing.
   */
  generateBuildId: async () => {
    // In development, let Next.js handle buildId to ensure HMR and chunk
    // resolution work correctly.  In production use a deterministic id so
    // that multiple servers share identical paths for static assets.
    if (process.env.NODE_ENV === "development") {
      return null as unknown as string; // Next.js will generate a random ID
    }
    const gitHash = getGitHash();
    return `v${appVersion}-${gitHash}`;
  },

  /**
   * Configure headers for caching and security
   * Note: The primary Content Security Policy (CSP) is now managed in `middleware.ts`
   * @see {@link ./middleware.ts}
   * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>>}
   */
  headers: () => [
    // IMPORTANT: Content-Security-Policy is primarily set in middleware.ts
    // Headers set here might be overridden or complemented by the middleware
    // This section is mainly for cache-control and other non-CSP headers
    {
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
        {
          key: "CDN-Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
        {
          key: "Cloudflare-CDN-Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/_next/data/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=3600, stale-while-revalidate=86400",
        },
      ],
    },
    {
      source: "/_next/image/:params*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=60, stale-while-revalidate=3600, stale-if-error=86400",
        },
        {
          key: "CDN-Cache-Control",
          value: "public, max-age=3600, stale-while-revalidate=86400",
        },
      ],
    },
    // { // This empty object was causing the "source is missing" error and has been removed
    // Apply CSP to all HTML pages
    // NOTE: CSP is now primarily handled in middleware.ts. This block is effectively overridden - do not remove this comment.
    // },
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false, // Disable to save memory during builds
  // Enable Cache Components (formerly experimental.useCache in Next.js 15)
  // This is the new way to enable 'use cache' directive in Next.js 16
  cacheComponents: true,

  experimental: {
    taint: true,
    serverMinification: process.env.NODE_ENV === "production",
    preloadEntriesOnStart: false, // Don't preload all pages on server start
    serverSourceMaps: false, // Disable server source maps to save memory
    // Disable package optimization in development to reduce cache entries
    optimizePackageImports: process.env.NODE_ENV === "production" ? ["lucide-react", "@sentry/nextjs"] : [],
    // DISABLED EXPERIMENTAL FEATURES THAT COULD CAUSE MEMORY ISSUES:
    // webpackLayers: true, // DISABLED - experimental layer system
    // webpackPersistentCache: true, // DISABLED - experimental caching that could leak
    // optimizeModuleResolution: true, // DISABLED - experimental resolver

    // **KEEP ONLY STABLE MEMORY-RELATED FEATURES**
    // Optimize CSS handling to reduce memory usage
    optimizeCss: true,
    /**
     * Safely control how many pages Next.js generates in parallel.
     *  - Default: 1 (serial) to keep CI / low-RAM builds stable.
     *  - If the env var STATIC_GEN_CONCURRENCY is set to a finite integer 1-16,
     *    use that value.
     *  - Otherwise, auto-bump to 2 when ≥2 CPU cores are available – this shaves
     *    ~40-50 % off build time without significant memory spikes.
     */
    staticGenerationMaxConcurrency: (() => {
      const raw = process.env.STATIC_GEN_CONCURRENCY;
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 16) {
        return parsed;
      }

      try {
        const cpuCount = require("node:os").cpus().length;
        return cpuCount >= 2 ? 2 : 1;
      } catch {
        return 1; // Fallback for restricted environments
      }
    })(),
    // Enable experimental memory-efficient image optimization
    optimizeServerReact: true,
  },
  /**
   * Image optimization configuration
   * @see https://nextjs.org/docs/app/api-reference/components/image
   */
  images: {
    /**
     * Allows Nextjs to optimize SVGs using `next/image`
     * Note: This can have security implications if SVGs are user-uploaded
     * @see https://nextjs.org/docs/app/api-reference/components/image#dangerouslyallowsvg
     */
    dangerouslyAllowSVG: true,
    /**
     * Specifies how the `Content-Disposition` header should be set for optimized images
     * 'inline' attempts to display the image directly in the browser
     * 'attachment' would suggest downloading
     * @see https://nextjs.org/docs/app/api-reference/components/image#contentdispositiontype
     */
    contentDispositionType: "inline",
    /**
     * Specifies the image formats Nextjs should attempt to serve, in order of preference
     * Browsers that support these formats will receive them; others get the original format
     * AVIF generally offers better compression than WebP, but WebP has wider support and can be faster to encode
     * @see https://nextjs.org/docs/app/api-reference/components/image#formats
     */
    formats: ["image/webp", "image/avif"], // Prioritize webp over avif for speed
    /**
     * Specifies the image quality levels that can be used with next/image
     * Addresses the warning about unconfigured qualities in Next.js 15+
     * @see https://nextjs.org/docs/messages/next-image-unconfigured-qualities
     */
    qualities: [75, 80, 90, 100], // Support common quality settings
    /**
     * The minimum time (in seconds) an optimized image will be cached by the browser and CDNs
     * This is 7 days
     * @see https://nextjs.org/docs/app/api-reference/components/image#minimumcachettl
     */
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days cache
    /**
     * The base path for Nextjs optimized images Defaults to '/_next/image'
     * @see https://nextjs.org/docs/app/api-reference/components/image#path
     */
    path: "/_next/image",
    /**
     * Configuration for external image URLs that `next/image` is allowed to optimize
     * This is a security measure to prevent misuse of the image optimization API
     * @see https://nextjs.org/docs/app/api-reference/components/image#remotepatterns
     */
    /**
     * Local image route patterns with query string support
     * IMPORTANT: Omitting `search` property (or setting to undefined) allows ANY query string
     * Setting `search: ""` (empty string) ONLY allows URLs WITHOUT query strings
     * Setting `search: "?foo=bar"` (exact string) ONLY allows that EXACT query string
     * @see node_modules/next/dist/shared/lib/match-local-pattern.js
     */
    localPatterns: [
      {
        pathname: "/api/assets/**",
        // search omitted to allow cache-buster and context query params
      },
      {
        pathname: "/api/cache/images",
        // search omitted to allow width/url query params
      },
      {
        pathname: "/api/logo",
        // search omitted to allow website/domain/company query params
      },
      {
        pathname: "/api/logo/invert",
        // search omitted to allow website/domain/company query params
      },
      {
        pathname: "/api/og-image",
        // search omitted to allow dynamic OG image query params
      },
    ],
    remotePatterns: [
      ...CDN_REMOTE_PATTERNS,
      /**
       * Whitelist for social media content delivery networks (CDNs)
       * Ensures `next/image` can optimize profile pictures and media from these specific services
       */
      // Discord image CDNs
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "media.discordapp.net" },
      // GitHub assets (avatars, raw content)
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.githubassets.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      // Twitter/X image CDNs
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      // LinkedIn media CDN
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "static.licdn.com" },
      // Bluesky image CDNs
      { protocol: "https", hostname: "cdn.bsky.app" },
      { protocol: "https", hostname: "cdn.bsky.social" },

      /**
       * Whitelist for general image sources and CDNs used by the site
       */
      // Stock photos and site-specific assets
      { protocol: "https", hostname: "images.unsplash.com" },
      // Icon and search engine image sources
      { protocol: "https", hostname: "icons.duckduckgo.com" },
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "external-content.duckduckgo.com" },
      // Logo services
      // Analytics and internal hosting platforms
      { protocol: "https", hostname: "umami.iocloudhost.net" },
      { protocol: "https", hostname: "plausible.iocloudhost.net" },
      { protocol: "https", hostname: "*.iocloudhost.net" }, // Wildcard for iocloudhost subdomains
      /**
       * Self-hosted infrastructure domains (popos-sf1 through popos-sf7)
       * These hosts run various self-hosted services including:
       * - AudioBookShelf (personal reading library API)
       * - Media servers and content APIs
       * - Other self-hosted applications
       * All subdomains (*.popos-sfX.com) are whitelisted for image optimization
       */
      { protocol: "https", hostname: "*.popos-sf1.com" },
      { protocol: "https", hostname: "*.popos-sf2.com" },
      { protocol: "https", hostname: "*.popos-sf3.com" },
      { protocol: "https", hostname: "*.popos-sf4.com" },
      { protocol: "https", hostname: "*.popos-sf5.com" },
      { protocol: "https", hostname: "*.popos-sf6.com" },
      { protocol: "https", hostname: "*.popos-sf7.com" },
    ],
    /**
     * An array of image widths (in pixels) that Nextjs will use to generate different image sizes
     * These are used for serving appropriately sized images based on the viewport
     * @see https://nextjs.org/docs/app/api-reference/components/image#devicesizes
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    /**
     * An array of image widths (in pixels) used for the `srcset` attribute, allowing the browser to pick the best image
     * These are typically smaller sizes for fixed-dimension images or icons
     * @see https://nextjs.org/docs/app/api-reference/components/image#imagesizes
     */
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  /**
   * Disable Next.js' default in-memory cache for ISR/data in production only.
   * In development we allow defaults to reduce filesystem cache churn.
   */
  ...(process.env.NODE_ENV === "production" ? { cacheMaxMemorySize: 0 } : {}),
};

const sentryWebpackPluginOptions = {
  // Additional config options for Sentry Webpack plugin
  // Essential: org, project, and SENTRY_AUTH_TOKEN (via env var) must be available
  silent: true,
  org: "williamcallahan-com",
  project: "williamcallahan-com",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  useRunAfterProductionCompileHook: false,
  // Application key for thirdPartyErrorFilterIntegration - marks bundled code
  // to distinguish it from third-party scripts (browser extensions, injected code)
  applicationKey: "williamcallahan-com",
  release: {
    name: process.env.NEXT_PUBLIC_GIT_HASH || process.env.NEXT_PUBLIC_APP_VERSION,
    deploy: {
      env: process.env.NODE_ENV || "production",
    },
  },
  // **ROOT CAUSE FIX: DISABLE SOURCE MAP MEMORY BOMB IN DEVELOPMENT**
  // This was causing gigabyte-scale memory usage during webpack compilation
  // Based on Sentry GitHub issue #13836 and official troubleshooting docs
  dryRun: process.env.NODE_ENV === "development", // Skip actual uploads in dev
  // Disable source map processing entirely in development
  ...(process.env.NODE_ENV === "development"
    ? {
        // In development, completely skip source map processing to prevent memory accumulation
        sourcemaps: {
          disable: true, // Disable all source map processing
        },
      }
    : {
        // In production, use optimized source map settings with Debug IDs
        widenClientFileUpload: true, // Upload larger set of source maps
        sourcemaps: {
          assets: ["./**/*.js", "./**/*.js.map"], // Include all JS files and maps
          ignore: ["./node_modules/**"],
          // Enable debug IDs for better source map matching
          filesToDeleteAfterUpload: ["./**/*.js.map"], // Clean up map files after upload
        },
      }),
};

// Configure Content Security Policy
// existing code
// Ensure this is the last line related to Sentry configuration.
// Make sure to add the Sentry Webpack plugin options to the Node SDK to allow source map uploads to Sentry.
// For more information, see the Sentry documentation:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
