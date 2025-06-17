/**
 * Contact / Social Media Page
 *
 * This page displays social media contact information in a card format
 * similar to the bookmark cards
 */

import { SocialContactClient } from "@/components/features/social/contact.client";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import type { Metadata } from "next";

// Create metadata for the contact page
export const metadata: Metadata = getStaticPageMetadata("/contact", "contact");

/**
 * Enable ISR for contact page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

export default function ContactPage() {
  return <SocialContactClient />;
}
