/**
 * @fileoverview Type definitions for software-related features.
 * @description Contains types for software schema.org metadata.
 * @module types/features/software
 */

/**
 * Props for the SoftwareSchema component.
 */
export interface SoftwareSchemaProps {
  /** The name of the software */
  name: string;
  /** A description of the software */
  description: string;
  /** The operating system(s) supported */
  operatingSystem?: string;
  /** The category of the application */
  applicationCategory?: string;
  /** Whether the software is free */
  isFree?: boolean;
  /** The price of the software if not free */
  price?: number;
  /** The currency of the price */
  priceCurrency?: string;
  /** The average rating value */
  ratingValue?: number;
  /** The total number of ratings */
  ratingCount?: number;
  /** The URL to download the software */
  downloadUrl?: string;
  /** The version of the software */
  softwareVersion?: string;
  /** URL(s) of screenshots */
  screenshot?: string | string[];
  /** The name of the author */
  authorName?: string;
  /** The URL of the author's profile or website */
  authorUrl?: string;
  /** CSP nonce to be passed to the script tag */
  nonce?: string;
}

/**
 * Extends the base schema for a script tag with properties for a SoftwareApplication.
 *
 * @see {@link "https://schema.org/SoftwareApplication"}
 */
export interface SoftwareScriptSchema {
  "@context": "https://schema.org";
  "@id": string;
  "@type": "SoftwareApplication";
  name: string;
  description: string;
  operatingSystem?: string;
  applicationCategory?: string;
  offers?: {
    "@type": "Offer";
    price: number;
    priceCurrency: string;
    availability: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    ratingCount: number;
    bestRating: number;
    worstRating: number;
  };
  downloadUrl?: string;
  softwareVersion?: string;
  screenshot?: string | string[];
  author?: {
    "@type": "Person";
    name: string;
    url?: string;
  };
}
