/**
 * Experience Page
 * @module app/experience/page
 * @description
 * Displays professional experience and work history.
 * Shows timeline of career progression.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage specification
 */

import type { Metadata } from 'next';
import { Experience } from '../../components/features/experience';
import { metadata as siteMetadata, SITE_NAME } from '../../data/metadata';

// Define core content for this page
const EXPERIENCE_METADATA = {
  title: `Professional Experience - ${SITE_NAME}`,
  description: 'Explore William Callahan\'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.',
  jobTitle: 'Software Engineer & Startup Investor',
  bio: 'Software engineer, startup investor, and Techstars founder based in San Francisco.',
};

/**
 * Generate metadata for the experience page using Next.js 14 Metadata API
 * Includes:
 * - Basic meta tags
 * - OpenGraph profile metadata
 * - Twitter card metadata
 * - Canonical URL (production only)
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://ogp.me"} - OpenGraph specification
 */
export const metadata: Metadata = {
  title: EXPERIENCE_METADATA.title,
  description: EXPERIENCE_METADATA.description,
  openGraph: {
    title: EXPERIENCE_METADATA.title,
    description: EXPERIENCE_METADATA.description,
    type: 'profile',
    images: [siteMetadata.defaultImage],
    url: 'https://williamcallahan.com/experience',
    siteName: SITE_NAME,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: EXPERIENCE_METADATA.title,
    description: EXPERIENCE_METADATA.description,
    images: [siteMetadata.defaultImage],
  },
  ...(process.env.NODE_ENV === 'production' && {
    alternates: {
      canonical: 'https://williamcallahan.com/experience',
    },
  }),
};

// Force static generation
export const revalidate = false;

/**
 * Experience page component
 * Renders the experience timeline and JSON-LD structured data
 * Following Next.js recommendation to include JSON-LD in the page component
 *
 * @see {@link "https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld"}
 */
export default function ExperiencePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: EXPERIENCE_METADATA.title,
    description: EXPERIENCE_METADATA.description,
    mainEntity: {
      '@type': 'Person',
      name: SITE_NAME,
      jobTitle: EXPERIENCE_METADATA.jobTitle,
      description: EXPERIENCE_METADATA.bio,
      sameAs: siteMetadata.social.profiles,
      image: siteMetadata.defaultImage.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Experience />
    </>
  );
}
