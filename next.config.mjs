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
    // Configure SVG handling
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack']
    });

    // Handle node modules in API routes
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
      path: false
    };

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
        'path': false
      }
    }
  },
  // Keep standalone output for Docker deployments
  output: 'standalone',
  reactStrictMode: true,
  // swcMinify: true,
  /**
   * Image optimization configuration
   * @see https://nextjs.org/docs/app/api-reference/components/image
   */
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    // CSP configuration allowing analytics scripts from configured domains
    contentSecurityPolicy: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.iocloudhost.net https://plausible.iocloudhost.net`,
    formats: ['image/avif', 'image/webp'],
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
      }
    ]
  }
};

export default nextConfig;
