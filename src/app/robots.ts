/**
 * Robots.txt Generation
 * @module app/robots
 * @description
 * Generates a robots.txt file for the website using Next.js 14's Metadata API.
 * This file automatically generates a robots.txt file at build time,
 * configuring search engine crawling rules and sitemap location.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from "next";

/**
 * Generate robots.txt for the application
 * Handles different rules for production and non-production environments:
 * - Production: Allow all except /api/ and specific problematic paths, include sitemap
 * - Non-production: All instances other than https://williamcallahan.com, prevent all crawling
 *
 * @returns {MetadataRoute.Robots} Robots.txt configuration
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.NEXT_PUBLIC_SITE_URL === "https://williamcallahan.com";

  // Define common problematic paths to disallow in production
  // NOTE: In robots.txt, the most specific matching rule takes precedence; order here is for readability only
  const disallowedProdPaths = [
    "/api/debug/", // Block debug endpoints
    "/api/send", // Block analytics proxy (Plausible)
    "/api/tunnel", // Block error tracking proxy (Sentry)
    "/api/cache-images", // Block internal cache endpoint
    "/opt/",
    "/Library/",
    "/Applications/",
    "/bin/",
    "/etc/",
    "/comments/feed/",
    "/legacy-homepage/",
    "/author/",
  ];

  // Paths that should be explicitly allowed for crawling
  // /api/assets/ serves bookmark preview images that should be indexable
  const allowedProdPaths = ["/", "/api/assets/"];

  return {
    rules: {
      userAgent: "*",
      ...(isProd
        ? {
            allow: allowedProdPaths,
            disallow: disallowedProdPaths,
          }
        : {
            disallow: "/",
          }),
    },
    ...(isProd && {
      sitemap: "https://williamcallahan.com/sitemap.xml",
    }),
  };
}
