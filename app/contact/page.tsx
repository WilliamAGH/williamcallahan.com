/**
 * Contact / Social Media Page
 *
 * This page displays social media contact information in a card format
 * similar to the bookmark cards
 */

import type { Metadata } from "next";
import { SocialContactClient } from "@/components/features/social/contact.client";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";

export const dynamic = "force-static";
export const metadata: Metadata = getStaticPageMetadata("/contact", "contact");

/**
 * Enable ISR for contact page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

export default function ContactPage() {
  // Generate JSON-LD schema for the contact page
  const pageMetadata = PAGE_METADATA.contact;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/contact",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    image: {
      url: "/images/og/contact-og.png",
      width: 2100,
      height: 1100,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/contact", name: "Contact" },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <SocialContactClient />
    </>
  );
}
