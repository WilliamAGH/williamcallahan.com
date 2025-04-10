/**
 * Software Application Schema Component
 * @module components/features/blog/blog-article/software-schema
 * @description
 * A component that can be used in MDX blog posts to add SoftwareApplication schema.org metadata.
 * This helps with SEO for posts about software applications and extensions.
 *
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication specification
 */

'use client';

import { JsonLdScript } from '../../../seo/json-ld';
import { ensureAbsoluteUrl } from '../../../../lib/seo/utils';

interface SoftwareSchemaProps {
  /** Name of the software application */
  name: string;
  /** Description of the software application */
  description: string;
  /** Operating system(s) the software runs on */
  operatingSystem?: string;
  /** Application category (e.g., "DeveloperApplication", "UtilitiesApplication") */
  applicationCategory?: string;
  /** Whether the software is free */
  isFree?: boolean;
  /** Price of the software (if not free) */
  price?: number;
  /** Currency for the price */
  priceCurrency?: string;
  /** Average rating value */
  ratingValue?: number;
  /** Number of ratings */
  ratingCount?: number;
  /** URL to download the software */
  downloadUrl?: string;
  /** Software version */
  softwareVersion?: string;
  /** URL to screenshot(s) of the software */
  screenshot?: string | string[];
  /** Author name */
  authorName?: string;
  /** Author URL */
  authorUrl?: string;
}

/**
 * Component that renders Schema.org SoftwareApplication JSON-LD script
 * Can be used directly in MDX blog posts
 */
export function SoftwareSchema({
  name,
  description,
  operatingSystem = 'Windows, macOS, Linux',
  applicationCategory = 'DeveloperApplication',
  isFree = true,
  price,
  priceCurrency = 'USD',
  ratingValue,
  ratingCount,
  downloadUrl,
  softwareVersion,
  screenshot,
  authorName,
  authorUrl,
}: SoftwareSchemaProps) {
  // Create base schema
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': name,
    'description': description,
  };

  // Add operating system if provided
  if (operatingSystem) {
    schema.operatingSystem = operatingSystem;
  }

  // Add application category if provided
  if (applicationCategory) {
    schema.applicationCategory = applicationCategory;
  }

  // Add pricing information
  if (isFree) {
    schema.offers = {
      '@type': 'Offer',
      'price': 0.00,
      'priceCurrency': priceCurrency,
      'availability': 'https://schema.org/InStock'
    };
  } else if (price !== undefined) {
    schema.offers = {
      '@type': 'Offer',
      'price': price,
      'priceCurrency': priceCurrency,
      'availability': 'https://schema.org/InStock'
    };
  }

  // Add rating information if provided
  if (ratingValue !== undefined && ratingCount !== undefined) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': ratingValue,
      'ratingCount': ratingCount,
      'bestRating': 5,
      'worstRating': 1
    };
  }

  // Add download URL if provided
  if (downloadUrl) {
    schema.downloadUrl = ensureAbsoluteUrl(downloadUrl);
  }

  // Add version if provided
  if (softwareVersion) {
    schema.softwareVersion = softwareVersion;
  }

  // Add screenshots if provided
  if (screenshot) {
    schema.screenshot = Array.isArray(screenshot)
      ? screenshot.map(url => ensureAbsoluteUrl(url))
      : ensureAbsoluteUrl(screenshot);
  }

  // Add author if provided
  if (authorName) {
    schema.author = {
      '@type': 'Person',
      'name': authorName,
      ...(authorUrl && { 'url': ensureAbsoluteUrl(authorUrl) })
    };
  }

  return <JsonLdScript data={schema} />;
}