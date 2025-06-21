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
import type { RuleSetRule } from "webpack"; // Import RuleSetRule type

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

// Get version and cache it
const appVersion = getPackageVersion();
process.env.NEXT_PUBLIC_APP_VERSION = appVersion;

const nextConfig = {
  /**
   * Turbopack configuration (when using --turbo flag)
   * Note: This is used instead of webpack config when running with Turbopack
   */
  turbopack: {
    // Custom loaders for Turbopack
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },

  /**
   * Custom webpack configuration
   * @param {import('webpack').Configuration} config - Webpack config object
   * @returns {import('webpack').Configuration} Modified webpack config
   */
  webpack: (config: import("webpack").Configuration) => {
    // Added type annotation
    // Configure SVG handling, excluding /public directory
    const svgRule: RuleSetRule = {
      test: /\.svg$/i,
      issuer: /\.(js|ts|jsx|tsx|mdx)$/,
      exclude: /public\//, // Exclude SVGs in the public folder
      use: [
        {
          loader: "@svgr/webpack",
          options: {
            icon: true, // Optional: Treat SVGs as icons
          },
        },
      ],
    };
    // Ensure module and rules exist before pushing
    if (!config.module) {
      config.module = { rules: [] };
    }
    if (!config.module.rules) {
      config.module.rules = [];
    }
    config.module.rules.push(svgRule);

    // Exclude dts files from being processed by Webpack
    if (Array.isArray(config.module.rules)) {
      config.module.rules.push({
        test: /\.d\.ts$/,
        exclude: /.*/,
      });
    }

    // Let default Nextjs handle SVGs in /public for next/image
    // Find the default rule that handles images and ensure it still processes SVGs in public
    // (This part is usually handled automatically by Nextjs unless overridden)

    // Handle node modules in API routes
    // Ensure resolve and fallback exist before modifying
    if (!config.resolve) {
      config.resolve = {};
    }
    if (!config.resolve.fallback) {
      config.resolve.fallback = {};
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      path: false,
      child_process: false,
      os: false,
      stream: false,
      util: false,
      net: false,
      tls: false,
      worker_threads: false,
    };

    // Add server externals to prevent bundling server-only code
    if (!config.externals) {
      config.externals = [];
    }
    if (Array.isArray(config.externals)) {
      config.externals.push({
        sharp: "commonjs sharp",
        "node:child_process": "commonjs child_process",
        "node:crypto": "commonjs crypto",
        "node:fs": "commonjs fs",
        "node:os": "commonjs os",
        "node:path": "commonjs path",
        "node:stream": "commonjs stream",
        "node:util": "commonjs util",
        "detect-libc": "commonjs detect-libc",
      });
    }

    // Optimize webpack cache for memory efficiency
    if (process.env.NODE_ENV === "development") {
      // Use filesystem cache in development to dramatically reduce memory usage.
      // Each compiler (server, client, edge-server) needs a unique cache name.
      const compilerName = config.name || "unknown";
      config.cache = {
        type: "filesystem",
        // Let Next.js handle buildDependencies automatically
        compression: "gzip",
        hashAlgorithm: "xxhash64",
        name: `dev-cache-${compilerName}`,
        version: appVersion,
      };

      // Disable source maps in development to save ~30% memory
      config.devtool = false;

      // Limit parallelism to reduce concurrent memory usage
      config.parallelism = 1;

      // Optimize module resolution
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: true,
        removeEmptyChunks: true,
        sideEffects: false,
      };
    } else {
      // Keep memory cache in production for performance
      config.cache = {
        type: "memory",
        maxGenerations: 1,
        cacheUnaffected: false,
      };
    }

    // Suppress warnings for Sentry and OpenTelemetry dynamic requires
    config.ignoreWarnings = [
      // Suppress warnings about dynamic requires
      { module: /node_modules\/require-in-the-middle\/index\.js/ },
      {
        module: /node_modules\/@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js/,
      },
      { module: /node_modules\/@sentry/ },
      // Suppress webpack cache serialization warnings
      /Skipped not serializable cache item/,
      // Suppress third-party CSS autoprefixer warnings
      /autoprefixer.*grid-auto-rows.*not supported by IE/,
      /autoprefixer.*grid-gap.*only works if grid-template/,
      /autoprefixer.*Autoplacement does not work without grid-template/,
      // Suppress react-tweet CSS warnings
      { module: /node_modules\/react-tweet.*\.css$/ },
    ];

    // We no longer need to externalize require-in-the-middle since we've added it as a dependency
    // Externalizing was causing the runtime error in production

    // Fix source map issues
    if (process.env.NODE_ENV === "development" && config.optimization?.minimizer) {
      // Added check for minimizer array
      // Remove the devtool setting that's causing warnings
      config.optimization.minimizer.forEach((minimizer: unknown) => {
        // Added type annotation
        // Runtime check is still necessary as minimizer is unknown
        if (typeof minimizer === "object" && minimizer !== null && minimizer.constructor.name === "TerserPlugin") {
          // Explicitly type options to satisfy ESLint/TypeScript
          const terserOptions = (minimizer as any).options; // Keep 'as any' for flexibility with webpack plugins
          if (terserOptions && typeof terserOptions === "object") {
            // Set sourceMap, assuming it might exist or needs to be added
            (terserOptions as { sourceMap?: boolean }).sourceMap = true;
          }
        }
      });
    }

    return config;
  },

  /**
   * Generate a consistent build ID across servers
   * This ensures chunk filenames are identical between deployments
   * Only change this when intentionally refreshing all cached assets
   */
  generateBuildId: () => {
    // Base the build ID on app version for consistent hashing
    return `v${appVersion}-stable`;
  },

  /**
   * Configure headers for caching and security
   * Note: The primary Content Security Policy (CSP) is now managed in `middlewarets`
   * @see {@link ./middleware.ts}
   * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>>}
   */
  headers: () => [
    // IMPORTANT: Content-Security-Policy is primarily set in middlewarets
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
      source: "/_next/image:params*",
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
    // NOTE: CSP is now primarily handled in middlewarets This block is effectively overridden - do not remove this comment
    // },
  ],

  // Standard Nextjs config options
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false, // Disable to save memory during builds
  // Nextjs 15 uses SWC by default; swcMinify option is no longer needed
  // Add transpilePackages to handle ESM packages - removed Sentry/OpenTelemetry to reduce watchers
  transpilePackages: ["next-mdx-remote"],
  experimental: {
    taint: true,
    serverMinification: true,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true, // Enable webpack memory optimizations
    preloadEntriesOnStart: false, // Don't preload all pages on server start
    serverSourceMaps: false, // Disable server source maps to save memory
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
    remotePatterns: [
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
      { protocol: "https", hostname: "williamcallahan.com" },
      { protocol: "https", hostname: "dev.williamcallahan.com" },
      // Icon and search engine image sources
      { protocol: "https", hostname: "icons.duckduckgo.com" },
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "external-content.duckduckgo.com" },
      // Logo services
      { protocol: "https", hostname: "logo.clearbit.com" },
      // Analytics and internal hosting platforms
      { protocol: "https", hostname: "umami.iocloudhost.net" },
      { protocol: "https", hostname: "plausible.iocloudhost.net" },
      { protocol: "https", hostname: "*.iocloudhost.net" }, // Wildcard for iocloudhost subdomains
      // Specific hosting provider subdomains
      { protocol: "https", hostname: "*.popos-sf1.com" },
      { protocol: "https", hostname: "*.popos-sf2.com" },
      { protocol: "https", hostname: "*.popos-sf3.com" },
      { protocol: "https", hostname: "*.digitaloceanspaces.com" }, // DigitalOcean Spaces CDN
      { protocol: "https", hostname: "*.callahan.cloud" }, // DigitalOcean Spaces CDN

      /**
       * Development-only: Allow all image sources for easier local development
       * This uses a ternary operator to conditionally spread these patterns into the array
       * if `processenvNODE_ENV` is 'development'
       */
      ...(process.env.NODE_ENV === "development"
        ? [
            {
              protocol: "https",
              hostname: "**", // Allows all HTTPS domains in development
            },
            {
              protocol: "http",
              hostname: "**", // Allows all HTTP domains in development
            },
          ]
        : []),
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
};

const sentryWebpackPluginOptions = {
  // Additional config options for Sentry Webpack plugin
  // Essential: org, project, and SENTRY_AUTH_TOKEN (via env var) must be available
  silent: process.env.SENTRY_SILENT_OUTPUT === "true", // Example: use env var to control verbosity
  org: "williamcallahan-com",
  project: "williamcallahan-com",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {
    name: process.env.NEXT_PUBLIC_APP_VERSION,
    deploy: {
      env: process.env.NODE_ENV || "production",
    },
  },
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  widenClientFileUpload: true, // Uploads more sourcemaps for client-side code
  // Transpile the Sentry client SDK for wider browser support (option previously in nextConfig.sentry)
  transpileClientSDK: true,
  // Additional options to improve source map coverage
  sourcemaps: {
    assets: ["**/*.js", "**/*.map"],
    ignore: ["node_modules/**"],
  },
  // Disable telemetry if desired
  telemetry: false,
};

// Configure Content Security Policy
// existing code
// Ensure this is the last line related to Sentry configuration
// Make sure to an Sentry Webpack plugin to Node SDK options to allow for source map uploads to Sentry
// For more information, see the Sentry documentation:
// https://docssentryio/platforms/javascript/guides/nextjs/manual-setup/
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
