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

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Get package.json version to use in build ID
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
  webpack: (config) => {
    // Configure SVG handling, excluding /public directory
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.(js|ts|jsx|tsx|mdx)$/,
      exclude: /public\//, // Exclude SVGs in the public folder
      use: [{
        loader: '@svgr/webpack',
        options: {
          icon: true, // Optional: Treat SVGs as icons
        }
      }]
    });

    // Let default Next.js handle SVGs in /public for next/image
    // Find the default rule that handles images and ensure it still processes SVGs in public
    // (This part is usually handled automatically by Next.js unless overridden)

    // Handle node modules in API routes
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
    if (process.env.NODE_ENV === 'development') {
      // Remove the devtool setting that's causing warnings
      config.optimization.minimizer.forEach((minimizer) => {
        if (minimizer.constructor.name === 'TerserPlugin') {
          minimizer.options.sourceMap = true;
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
  generateBuildId: async () => {
    // Base the build ID on package.json version for consistent hashing
    return `v${packageJson.version}-stable`;
  },

  /**
   * Configure headers for caching and security
   * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>>}
   */
  headers: async () => [
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

export default withSentryConfig(nextConfig, {
// For all available options, see:
// https://www.npmjs.com/package/@sentry/webpack-plugin#options

org: "williamcallahan-com", // Updated org name
project: "javascript-nextjs",

// Only print logs for uploading source maps in CI
silent: !process.env.CI,

// For all available options, see:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

// Upload a larger set of source maps for prettier stack traces (increases build time)
widenClientFileUpload: true,

// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
// This can increase your server load as well as your hosting bill.
// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
// side errors will fail.
tunnelRoute: "/monitoring",

// Automatically tree-shake Sentry logger statements to reduce bundle size
disableLogger: true,

// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
// See the following for more information:
// https://docs.sentry.io/product/crons/
// https://vercel.com/docs/cron-jobs
automaticVercelMonitors: true,
});
