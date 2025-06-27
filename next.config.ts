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
   * Include data directory in standalone build output
   * This ensures static data files are available in production
   */
  outputFileTracingIncludes: {
    '/': ['./data/**/*'],
  },

  /**
   * Turbopack configuration (moved from experimental.turbo)
   * Turbopack is now stable in Next.js 15
   * Valid options: root, rules, resolveAlias, resolveExtensions
   */
  turbopack: {
    // Configure SVG handling for Turbopack (equivalent to webpack config)
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
    // Configure module resolution extensions
    resolveExtensions: [".mdx", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
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
        "node:child_process": "commonjs child_process",
        "node:crypto": "commonjs crypto",
        "node:fs": "commonjs fs",
        "node:os": "commonjs os",
        "node:path": "commonjs path",
        "node:stream": "commonjs stream",
        "node:util": "commonjs util",
        "detect-libc": "commonjs detect-libc",
        // Ignore optional dependencies that cause build warnings
        "osx-temperature-sensor": "commonjs osx-temperature-sensor",
      });
    }

    // Mark server-only packages as external to prevent client-side bundling
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push("googleapis"); // 114MB package only used in server scripts
    }

    // **NEXT.JS 15 WEBPACK COMPILATION MEMORY OPTIMIZATIONS**
    // These target the specific webpack memory growth issue (109MB -> 1200MB+)

    // 1. Aggressive module concatenation limits for memory efficiency
    if (!config.optimization) {
      config.optimization = {};
    }
    config.optimization.concatenateModules = process.env.NODE_ENV !== "development";

    // 2. Limit webpack's internal memory usage during compilation
    config.optimization.minimize = process.env.NODE_ENV === "production";
    config.optimization.removeAvailableModules = true;
    config.optimization.removeEmptyChunks = true;
    config.optimization.mergeDuplicateChunks = true;
    config.optimization.flagIncludedChunks = process.env.NODE_ENV === "production";

    // 3. Configure module resolution to reduce memory pressure
    if (!config.resolve.modules) {
      config.resolve.modules = [];
    }
    config.resolve.modules = ["node_modules"];
    config.resolve.symlinks = false; // Disable symlink resolution to save memory

    // Add alias to fix swr import issue with react-tweet
    if (!config.resolve.alias || Array.isArray(config.resolve.alias)) {
      config.resolve.alias = {};
    }

    // Fix SWR module resolution for Next.js 15 canary
    // This handles the subpath exports issue with webpack
    config.resolve.alias = config.resolve.alias || {};

    // Direct module resolution for SWR subpaths
    const path = require("node:path");
    try {
      // Force webpack to use the CommonJS build of SWR that has default export
      config.resolve.alias.swr$ = path.resolve(__dirname, "node_modules/swr/dist/index/index.js");
      config.resolve.alias["swr/infinite"] = require.resolve("swr/infinite");
      config.resolve.alias["swr/_internal"] = require.resolve("swr/_internal");

      // Fix hoist-non-react-statics for Sentry
      config.resolve.alias["hoist-non-react-statics$"] = path.resolve(
        __dirname,
        "node_modules/hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js",
      );
    } catch (e) {
      void e; // Mark as intentionally unused
      console.warn("[Next Config] Could not resolve SWR submodules, using fallback paths");
    }

    // Fix for Sentry/OpenTelemetry compatibility issue in Edge runtime
    // DiagLogLevel was removed in OpenTelemetry API 1.9.0
    // Create a webpack plugin to handle the missing export
    const webpack = require("webpack");
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/@opentelemetry\/api/, (resource) => {
        // Only apply fix for Edge runtime builds
        if (resource.context.includes("@sentry/vercel-edge")) {
          resource.request = path.resolve(__dirname, "lib/edge-polyfills/opentelemetry.ts");
        }
      }),
    );

    // 4. Limit concurrent module processing
    config.parallelism = 1; // Already set but ensuring it's applied

    // 5. Configure webpack stats to reduce memory overhead
    config.stats = process.env.NODE_ENV === "development" ? "minimal" : "errors-warnings";

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
        // **ENHANCED MEMORY LIMITS FOR NEXT.JS 15**
        maxMemoryGenerations: 1, // Limit memory generations
        memoryCacheUnaffected: false, // Don't keep unaffected modules in memory
        maxAge: 1000 * 60 * 60 * 24, // 24 hours max age
        // Aggressive cache memory management
        store: "pack", // Use pack store for better memory efficiency
        profile: false, // Disable profiling to save memory
      };

      // Disable source maps in development to save ~30% memory
      config.devtool = false;

      // **NEXT.JS 15 SPECIFIC OPTIMIZATIONS**
      // Enhanced split chunks configuration for memory efficiency
      config.optimization.splitChunks = {
        chunks: "all",
        minSize: 20000,
        maxSize: 244000, // Limit chunk size to prevent large modules in memory
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        automaticNameDelimiter: "~",
        cacheGroups: {
          // Prevent large vendor bundles in memory during development
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
            enforce: false,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            priority: -10,
            chunks: "all",
            enforce: false,
            maxSize: 244000, // Limit vendor chunk size
          },
          // Separate large libraries to prevent memory spikes
          sentry: {
            test: /[\\/]node_modules[\\/]@sentry[\\/]/,
            name: "sentry",
            priority: 10,
            chunks: "all",
            enforce: true,
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: "react",
            priority: 20,
            chunks: "all",
            enforce: true,
          },
        },
      };

      // Limit TypeScript checker memory usage
      if (!config.plugins) {
        config.plugins = [];
      }

      // **ENHANCED MEMORY MONITORING FOR NEXT.JS 15**
      // Keep a small state to throttle logs
      const memoryProgressState = { lastPct: -0.2, lastTime: 0 } as {
        lastPct: number;
        lastTime: number;
      };

      config.plugins.push(
        new webpack.ProgressPlugin({
          handler: (percentage: number, message?: string) => {
            const now = Date.now();
            // Only log when:
            //   • start or end
            //   • moved at least 10% since last log OR 3 s elapsed
            const pctMoved = Math.abs(percentage - memoryProgressState.lastPct);
            const timeElapsed = now - memoryProgressState.lastTime;

            if (!(percentage === 0 || percentage === 1 || pctMoved >= 0.1 || timeElapsed >= 3000)) {
              return; // Skip overly-chatty updates
            }

            memoryProgressState.lastPct = percentage;
            memoryProgressState.lastTime = now;

            const used = process.memoryUsage();
            const rss = Math.round(used.rss / 1024 / 1024);
            const heap = Math.round(used.heapUsed / 1024 / 1024);
            const external = Math.round(used.external / 1024 / 1024);

            // Calculate memory pressure as percentage of available memory
            const totalMemory = require("node:os").totalmem() / 1024 / 1024;
            const memoryPressure = (rss / totalMemory) * 100;

            console.log(
              `[Webpack Memory] ${Math.round(percentage * 100)}% | ` +
                `RSS: ${rss}MB, Heap: ${heap}MB, External: ${external}MB | ` +
                `Pressure: ${memoryPressure.toFixed(1)}% | ` +
                `Phase: ${message || "unknown"}`,
            );

            // Next.js 15 appropriate memory thresholds
            if (rss > 6000) {
              // Critical: 6GB indicates severe memory issues
              console.error(`🚨 [Webpack Memory CRITICAL] RSS exceeded 6GB: ${rss}MB - OOM risk!`);
            } else if (rss > 4000) {
              // Alert: 4GB indicates potential memory issues
              console.warn(`⚠️  [Webpack Memory Alert] RSS exceeded 4GB: ${rss}MB`);
            } else if (rss > 2000) {
              // Warning: 2GB is typical but worth monitoring
              console.log(`📊 [Webpack Memory Warning] RSS exceeded 2GB: ${rss}MB`);
            }

            // Also warn on high memory pressure
            if (memoryPressure > 80) {
              console.warn(`⚠️  [Webpack Memory Pressure] Using ${memoryPressure.toFixed(1)}% of system memory`);
            }
          },
        }),
      );
    } else {
      // **PRODUCTION MEMORY OPTIMIZATIONS FOR NEXT.JS 15**
      // Keep memory cache in production but with strict limits
      config.cache = {
        type: "memory",
        maxGenerations: 1,
        cacheUnaffected: false,
        // Add memory limits for production builds
      };

      // Production-specific optimizations
      config.optimization.sideEffects = false;
      config.optimization.usedExports = true;
      config.optimization.providedExports = true;
    }

    // **NEXT.JS 15 RESOLVER OPTIMIZATIONS**
    // Configure resolver to be more memory efficient
    if (config.resolve) {
      config.resolve.cacheWithContext = false; // Disable context-sensitive caching
      config.resolve.unsafeCache = true; // Enable unsafe cache for better performance
      config.resolve.preferRelative = true; // Prefer relative paths to reduce resolution overhead
    }

    // Special handling for Edge runtime
    if (config.name === "edge-server") {
      // Prevent OpenTelemetry from being bundled in edge runtime
      if (!config.resolve) {
        config.resolve = {};
      }
      if (!config.resolve.alias) {
        config.resolve.alias = {};
      }

      // Use polyfill for OpenTelemetry modules in edge runtime
      const openTelemetryPolyfill = path.resolve(__dirname, "lib/edge-polyfills/opentelemetry.ts");
      config.resolve.alias["@opentelemetry/api"] = openTelemetryPolyfill;
      config.resolve.alias["@opentelemetry/instrumentation"] = openTelemetryPolyfill;
      config.resolve.alias["@sentry/opentelemetry"] = openTelemetryPolyfill;
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
      // **NEXT.JS 15 SPECIFIC WARNINGS**
      // Suppress memory-related webpack warnings
      /exceeded the recommended size limit/,
      /asset size limit/,
      /entrypoint size limit/,
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
  transpilePackages: ["next-mdx-remote", "swr"],
  experimental: {
    taint: true,
    serverMinification: false,
    webpackBuildWorker: false, // DISABLED - worker threads can accumulate memory
    webpackMemoryOptimizations: false, // DISABLED - might be buggy in canary
    preloadEntriesOnStart: false, // Don't preload all pages on server start
    serverSourceMaps: false, // Disable server source maps to save memory
    // Reduce memory usage in development
    optimizePackageImports: ["lucide-react", "@sentry/nextjs", "swr"],
    // Enable 'use cache' directive for Next.js 15 caching
    // ⚠️ NEVER DISABLE THIS - This is part of the memory SOLUTION, not the problem
    // This feature helps reduce memory usage by proper caching, disabling it makes memory worse
    useCache: true,
    // DISABLED EXPERIMENTAL FEATURES THAT COULD CAUSE MEMORY ISSUES:
    // webpackLayers: true, // DISABLED - experimental layer system
    // webpackPersistentCache: true, // DISABLED - experimental caching that could leak
    // optimizeModuleResolution: true, // DISABLED - experimental resolver

    // **KEEP ONLY STABLE MEMORY-RELATED FEATURES**
    // Optimize CSS handling to reduce memory usage
    optimizeCss: true,
    // Reduce memory usage during static generation
    staticGenerationMaxConcurrency: 1,
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
      // Analytics and internal hosting platforms
      { protocol: "https", hostname: "umami.iocloudhost.net" },
      { protocol: "https", hostname: "plausible.iocloudhost.net" },
      { protocol: "https", hostname: "*.iocloudhost.net" }, // Wildcard for iocloudhost subdomains
      // Specific hosting provider subdomains
      { protocol: "https", hostname: "*.popos-sf1.com" },
      { protocol: "https", hostname: "*.popos-sf2.com" },
      { protocol: "https", hostname: "*.popos-sf3.com" },
      { protocol: "https", hostname: "*.digitaloceanspaces.com" }, // DigitalOcean Spaces CDN
      { protocol: "https", hostname: "s3-storage.callahan.cloud" }, // S3 Storage CDN
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
  /**
   * Disable Next.js' default in-memory cache for ISR/data. We already employ
   * a bespoke cache (see `lib/server-cache.ts` & `lib/image-memory-manager.ts`).
   * Setting this to 0 prevents duplicated objects in RAM.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler
   */
  cacheMaxMemorySize: 0,
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
  // **ROOT CAUSE FIX: DISABLE SOURCE MAP MEMORY BOMB IN DEVELOPMENT**
  // This was causing gigabyte-scale memory usage during webpack compilation
  // Based on Sentry GitHub issue #13836 and official troubleshooting docs
  dryRun: process.env.NODE_ENV === "development", // Skip actual uploads in dev
  uploadSourceMaps: process.env.NODE_ENV === "production", // Only upload in production
  widenClientFileUpload: process.env.NODE_ENV === "production", // Only in production
  // Disable source map processing entirely in development
  ...(process.env.NODE_ENV === "development"
    ? {
        // In development, completely skip source map processing to prevent memory accumulation
        sourcemaps: {
          disable: true, // Disable all source map processing
        },
      }
    : {
        // In production, use optimized source map settings
        sourcemaps: {
          assets: ["**/*.js", "**/*.map"],
          ignore: ["node_modules/**"],
        },
      }),
};

// Configure Content Security Policy
// existing code
// Ensure this is the last line related to Sentry configuration
// Make sure to an Sentry Webpack plugin to Node SDK options to allow for source map uploads to Sentry
// For more information, see the Sentry documentation:
// https://docssentryio/platforms/javascript/guides/nextjs/manual-setup/
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
