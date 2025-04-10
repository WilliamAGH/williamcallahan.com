/**
 * Next.js Configuration
 * @module next.config
 * @description
 * Configuration file for Next.js application settings including:
 * - Webpack/Turbopack customization for SVG handling
 * - Node.js polyfills for API routes
 * - Image optimization settings
 * - Build output configuration
 * - Content Security Policy for scripts and images
 *
 * @see https://nextjs.org/docs/app/api-reference/next-config-js
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Custom webpack configuration
   * @param {import('webpack').Configuration} config - Webpack config object
   * @returns {import('webpack').Configuration} Modified webpack config
   */
  webpack(config) {
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

    return config;
  },

  /**
   * Turbopack configuration
   * Ensures compatibility when running with --turbo flag
   */
  experimental: {
    turbo: {
      rules: {
        // Configure SVG handling in Turbopack
        '*.svg': {
          loaders: ['@svgr/webpack']
        }
      },
      // Important resolvers for node modules in API routes
      resolveAliases: {
        'fs': false,
        'crypto': false,
        'path': false,
        // Add Sentry and OpenTelemetry package aliases for Turbopack
        'require-in-the-middle': 'commonjs require-in-the-middle',
        '@sentry/nextjs': { type: 'commonjs' },
        '@sentry/node': { type: 'commonjs' },
        '@opentelemetry/instrumentation': { type: 'commonjs' }
      }
    }
  },
  // Keep standalone output for Docker deployments
  output: 'standalone',
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
    // CSP configuration allowing analytics scripts and images from configured domains
    contentSecurityPolicy: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.iocloudhost.net https://plausible.iocloudhost.net https://static.cloudflareinsights.com; connect-src 'self' https://umami.iocloudhost.net https://plausible.iocloudhost.net https://static.cloudflareinsights.com; img-src 'self' data: https://images.unsplash.com https://williamcallahan.com https://icons.duckduckgo.com https://www.google.com https://external-content.duckduckgo.com https://logo.clearbit.com https://dev.williamcallahan.com https://*.iocloudhost.net https://*.popos-sf1.com https://*.popos-sf2.com https://*.popos-sf3.com`,
    formats: ['image/webp', 'image/avif'], // Prioritize webp over avif for speed
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days cache
    path: '/_next/image',
    // Allow unoptimized images as fallback in production
    remotePatterns: [
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
      }
    ],
    // Set larger size limits to avoid issues with large images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  }
};

export default nextConfig;
