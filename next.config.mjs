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
  // Optimize CSS and font loading
  optimizeFonts: true,
  experimental: {
    optimizeCss: true
  },

  // Add cache busting for builds
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },

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

    // Define common SVG loader options
    const svgOptions = {
      svgo: true,
      svgoConfig: {
        plugins: [{
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: false,
              removeTitle: false,
              inlineStyles: { onlyMatchedOnce: false },
            },
          },
        }],
      },
      titleProp: true,
      ref: true,
    };

    // Configure SVG handling for JSX/TSX files
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.[jt]sx?$/,
      use: [{ loader: '@svgr/webpack', options: svgOptions }],
    });

    // Configure SVG handling for MDX files
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.mdx?$/,
      use: [{ loader: '@svgr/webpack', options: svgOptions }],
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
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year
    // CSP configuration allowing SVGs and analytics
    contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://umami.iocloudhost.net https://plausible.iocloudhost.net https://*.cloudflareinsights.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.cloudflareinsights.com https://umami.iocloudhost.net https://plausible.iocloudhost.net;",
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
        hostname: 'static.cloudflareinsights.com'
      }
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048], // Optimize for common screen sizes
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Optimize for common image sizes
  },

  // Add headers for CORS and additional security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type'
          }
        ]
      }
    ];
  },

  // Handle analytics script proxying
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/js/script.js',
          destination: 'https://umami.iocloudhost.net/script.js'
        },
        {
          source: '/beacon.min.js',
          destination: 'https://static.cloudflareinsights.com/beacon.min.js'
        }
      ]
    };
  }
};

export default nextConfig;
