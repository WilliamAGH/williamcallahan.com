/**
 * Web App Manifest route (Next.js 15 `app/manifest.ts`)
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 *
 * This file exports a typed manifest object (`MetadataRoute.Manifest`).
 * It is served automatically by Next.js at `/manifest.webmanifest` and
 * picked up via the <link rel="manifest"> tag configured in `app/layout.tsx`.
 *
 * Keeping the manifest co-located in `app/` ensures the build pipeline
 * tree-shakes unused fields and validates the schema at compile-time.
 */

import type { MetadataRoute } from "next";
import { SITE_TITLE, SITE_NAME, SITE_DESCRIPTION, SEO_IMAGES } from "../data/metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#1A1B26", // Tailwind dark bg used across the site
    theme_color: "#3B82F6", // Tailwind blue-500 – matches accents/links
    icons: [
      {
        src: SEO_IMAGES.android192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: SEO_IMAGES.android512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  } satisfies MetadataRoute.Manifest;
}
