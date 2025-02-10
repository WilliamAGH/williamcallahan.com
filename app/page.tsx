/**
 * Home Page
 *
 * Landing page of the application.
 * Renders the main introduction and overview.
 */

import { Home } from "../components/features";
import { getStaticPageMetadata } from "../lib/seo/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = getStaticPageMetadata("/");

export default function HomePage() {
  return <Home />;
}
