/**
 * Home Page
 * @module app/page
 * @description
 * Main landing page for the site.
 * Introduces William Callahan and showcases key areas.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage specification
 */

import type { Metadata } from "next";
import { Home } from "@/components/features";
import { getStaticPageMetadata } from "@/lib/seo";

/**
 * Generate metadata for the home page using Next.js 14 Metadata API
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 */
export const metadata: Metadata = getStaticPageMetadata("/", "home");

/**
 * Make homepage more static and resilient to rapid requests
 * Remove force-dynamic to allow static generation where possible
 */
export const revalidate = 3600; // Revalidate every hour

/**
 * Home page component
 * Renders the main landing page
 */
export default function HomePage() {
  return <Home />;
}
