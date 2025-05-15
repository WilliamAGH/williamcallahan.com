/**
 * Next.js Configuration
 * @module next.config
 * @description
 * Configuration file for Next.js application settings including:
 * - Webpack customization for SVG handling
 * - Node.js polyfills for API routes
 * - Image optimization settings
 * - Build output configuration
 * - Content Security Policy for scripts and images
 *
 * @see https://nextjs.org/docs/app/api-reference/next-config-js
 * @type {import('next').NextConfig}
 */

import {withSentryConfig} from '@sentry/nextjs';
import type { RuleSetRule } from 'webpack'; // Import RuleSetRule type

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * @typedef {{ version: string }} PackageJson
 */

// Get package.json version to use in build ID
/** @type {PackageJson} */
const packageJson = JSON.parse(
  readFileSync(resolve('./package.json'), 'utf8')
);

// Make the app version available to client code
process.env.NEXT_PUBLIC_APP_VERSION = packageJson.version;

const nextConfig = {
  /**
   * Custom webpack configuration
   * @param {import('webpack').Configuration} config - Webpack config object
   * @returns {import('webpack').Configuration} Modified webpack config
   */
  webpack: (config: import('webpack').Configuration) => { // Added type annotation
    // Configure SVG handling, excluding /public directory
    const svgRule: RuleSetRule = {
      test: /\.svg$/i,
      issuer: /\.(js|ts|jsx|tsx|mdx)$/,
      exclude: /public\//, // Exclude SVGs in the public folder
      use: [{
        loader: '@svgr/webpack',
        options: {
          icon: true, // Optional: Treat SVGs as icons
        }
      }]
    };
    // Ensure module and rules exist before pushing
    if (!config.module) {
      config.module = { rules: [] };
    }
    if (!config.module.rules) {
      config.module.rules = [];
    }
    config.module.rules.push(svgRule);

    // Exclude .d.ts files from being processed by Webpack
    if (Array.isArray(config.module.rules)) {
      config.module.rules.push({
        test: /\.d\.ts$/,
        exclude: /.*/,
      });
    }

    // Let default Next.js handle SVGs in /public for next/image
    // Find the default rule that handles images and ensure it still processes SVGs in public
    // (This part is usually handled automatically by Next.js unless overridden)

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
      path: false
    };

    // Suppress warnings for Sentry and OpenTelemetry dynamic requires
    config.ignoreWarnings = [
      // Suppress warnings about dynamic requires
      { module: /node_modules\/require-in-the-middle\/index\.js/ },
      { module: /node_modules\/@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js/ },
      { module: /node_modules\/@sentry/ }
    ];

    // We no longer need to externalize require-in-the-middle since we've added it as a dependency
    // Externalizing was causing the runtime error in production

    // Fix source map issues
    if (process.env.NODE_ENV === 'development' && config.optimization?.minimizer) { // Added check for minimizer array
      // Remove the devtool setting that's causing warnings
      config.optimization.minimizer.forEach((minimizer: unknown) => { // Added type annotation
        // Runtime check is still necessary as minimizer is unknown
        if (typeof minimizer === 'object' && minimizer !== null && minimizer.constructor.name === 'TerserPlugin') {
          // Explicitly type options to satisfy ESLint/TypeScript
          const terserOptions = (minimizer as any).options; // Keep 'as any' for flexibility with webpack plugins
          if (terserOptions && typeof terserOptions === 'object') {
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
    // Base the build ID on package.json version for consistent hashing
    return `v${packageJson.version}-stable`;
  },

  /**
   * Configure headers for caching and security
   * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>>}
   */
  headers: () => [
    {
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
        {
          key: 'CDN-Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
        {
          key: 'Cloudflare-CDN-Cache-Control',
          value: 'public, max-age=31536000, immutable',
        }
      ],
    },
    {
      source: '/_next/data/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=3600, stale-while-revalidate=86400',
        }
      ],
    },
    {
      source: '/_next/image:params*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=60, stale-while-revalidate=3600, stale-if-error=86400',
        },
        {
          key: 'CDN-Cache-Control',
          value: 'public, max-age=3600, stale-while-revalidate=86400',
        }
      ],
    },
  ],

  // Standard Next.js config options
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: true, // Explicitly enable production source maps
  // Next.js 15 uses SWC by default; swcMinify option is no longer needed
  // Add transpilePackages to handle ESM packages and instrumentation packages
  transpilePackages: [
    'next-mdx-remote',
    '@sentry/nextjs',
    '@sentry/node',
    '@sentry/opentelemetry',
    '@opentelemetry/instrumentation',
    '@opentelemetry/api',
    'require-in-the-middle'
  ],
  experimental: {
    taint: true,
    serverMinification: true,
    webpackBuildWorker: true,
  },
  /**
   * Image optimization configuration
   * @see https://nextjs.org/docs/app/api-reference/components/image
   */
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    formats: ['image/webp', 'image/avif'], // Prioritize webp over avif for speed
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days cache
    path: '/_next/image',
    // Allow unoptimized images as fallback in production
    remotePatterns: [
      // Social media domains - specific for better security
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com'
      },
      {
        protocol: 'https',
        hostname: 'media.discordapp.net'
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com'
      },
      {
        protocol: 'https',
        hostname: 'github.githubassets.com'
      },
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com'
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com'
      },
      {
        protocol: 'https',
        hostname: 'abs.twimg.com'
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com'
      },
      {
        protocol: 'https',
        hostname: 'static.licdn.com'
      },
      {
        protocol: 'https',
        hostname: 'cdn.bsky.app'
      },
      {
        protocol: 'https',
        hostname: 'cdn.bsky.social'
      },

      // Original patterns
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      },
      {
        protocol: 'https',
        hostname: 'williamcallahan.com'
      },
      {
        protocol: 'https',
        hostname: 'dev.williamcallahan.com'
      },
      {
        protocol: 'https',
        hostname: 'icons.duckduckgo.com'
      },
      {
        protocol: 'https',
        hostname: 'www.google.com'
      },
      {
        protocol: 'https',
        hostname: 'external-content.duckduckgo.com'
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com'
      },
      {
        protocol: 'https',
        hostname: 'umami.iocloudhost.net'
      },
      {
        protocol: 'https',
        hostname: 'plausible.iocloudhost.net'
      },
      {
        protocol: 'https',
        hostname: '*.iocloudhost.net'
      },
      {
        protocol: 'https',
        hostname: '*.popos-sf1.com'
      },
      {
        protocol: 'https',
        hostname: '*.popos-sf2.com'
      },
      {
        protocol: 'https',
        hostname: '*.popos-sf3.com'
      },

      // Allow all domains in development
      ...(process.env.NODE_ENV === 'development' ? [
        {
          protocol: 'https',
          hostname: '**'
        },
        {
          protocol: 'http',
          hostname: '**'
        }
      ] : [])
    ],
    // Set larger size limits to avoid issues with large images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  }
};

const sentryWebpackPluginOptions = {
  // Additional config options for Sentry Webpack plugin.
  // Essential: org, project, and SENTRY_AUTH_TOKEN (via env var) must be available.
  silent: process.env.SENTRY_SILENT_OUTPUT === 'true', // Example: use env var to control verbosity
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.NEXT_PUBLIC_APP_VERSION }, // Set release name correctly
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.
  widenClientFileUpload: true, // Uploads more sourcemaps for client-side code
};

// Configure Content Security Policy
// ... existing code ...
// Ensure this is the last line related to Sentry configuration
// Make sure to an Sentry Webpack plugin to Node SDK options to allow for source map uploads to Sentry.
// For more information, see the Sentry documentation:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export default withSentryConfig(
  nextConfig, // Assuming nextConfig is your final config object before Sentry
  sentryWebpackPluginOptions
);
