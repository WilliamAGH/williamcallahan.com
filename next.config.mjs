// next.config.mjs

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
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Custom webpack configuration
   * @param {import('webpack').Configuration} config - Webpack config object
   * @returns {import('webpack').Configuration} Modified webpack config
   */
  webpack(config) {
    // Enable handling of node: protocol imports
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false
    };

    // Handle node: protocol imports for server components
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:fs/promises': 'fs/promises',
      'node:fs': 'fs',
      'node:path': 'path'
    };

    // Configure SVG handling with improved options
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgo: true,
            svgoConfig: {
              plugins: [
                {
                  name: 'preset-default',
                  params: {
                    overrides: {
                      removeViewBox: false,
                      removeTitle: false,
                    },
                  },
                },
              ],
            },
            titleProp: true,
            ref: true,
          },
        },
      ],
    });

    // Add specific rule for MDX-embedded SVGs
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.mdx?$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgo: true,
            svgoConfig: {
              plugins: [
                {
                  name: 'preset-default',
                  params: {
                    overrides: {
                      removeViewBox: false,
                      removeTitle: false,
                      inlineStyles: { onlyMatchedOnce: false },
                    },
                  },
                },
              ],
            },
            titleProp: true,
            ref: true,
          },
        },
      ],
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
  // Keep standalone output for Docker deployments
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  /**
   * Image optimization configuration
   * @see https://nextjs.org/docs/app/api-reference/components/image
   */
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    // CSP configuration allowing SVGs and analytics
    contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.iocloudhost.net https://plausible.iocloudhost.net; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';",
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
      }
    ]
  }
};

export default nextConfig;
