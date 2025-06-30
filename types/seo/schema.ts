/**
 * Schema.org JSON-LD Types
 * @module types/seo/schema
 * @description
 * Type definitions for Schema.org JSON-LD structured data.
 * These types follow the @graph pattern for proper entity relationships.
 */

import type { PacificDateString } from "./shared";

/**
 * Base properties shared by all Schema.org entities
 */
interface SchemaBase {
  "@type": string;
  "@id": string;
}

/**
 * Person entity representing the website owner
 */
export interface PersonSchema extends SchemaBase {
  "@type": "Person";
  name: string;
  description: string;
  url: string;
  sameAs: string[];
  image?: string | { "@id": string };
}

/**
 * Website entity representing the entire website
 */
export interface WebSiteSchema extends SchemaBase {
  "@type": "WebSite";
  url: string;
  name: string;
  description: string;
  publisher: { "@id": string };
}

/**
 * Image entity for profile pictures and article images
 */
export interface ImageObjectSchema extends SchemaBase {
  "@type": "ImageObject";
  url: string;
  contentUrl: string;
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Base webpage properties shared by all page types
 */
export interface WebPageBase extends SchemaBase {
  "@type": "WebPage";
  isPartOf: { "@id": string };
  url: string;
  name: string;
  description: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  breadcrumb?: { "@id": string };
  primaryImageOfPage?: { "@id": string };
  about?: { "@id": string };
}

/**
 * Article entity for blog posts
 */
export interface ArticleSchema extends SchemaBase {
  "@type": "Article";
  isPartOf: { "@id": string };
  author: { "@id": string };
  headline: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  mainEntityOfPage: { "@id": string };
  publisher: { "@id": string };
  image?: { "@id": string };
  articleSection: string;
  inLanguage: string;
  articleBody: string;
  keywords?: string | string[];
}

/**
 * Dataset entity for investment data
 */
export interface DatasetSchema extends SchemaBase {
  "@type": "Dataset";
  name: string;
  description: string;
  creator: { "@id": string };
  dateCreated: PacificDateString;
  dateModified: PacificDateString;
  license: string;
  isAccessibleForFree: boolean;
  includedInDataCatalog: {
    "@type": "DataCatalog";
    name: string;
  };
}

/**
 * Collection page entity for blog listings and bookmarks
 */
export interface CollectionPageSchema extends SchemaBase {
  "@type": "CollectionPage";
  isPartOf: { "@id": string };
  name: string;
  description: string;
  creator: { "@id": string };
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  mainEntity: {
    "@type": "ItemList";
    itemListElement: Array<{
      "@type": "ListItem";
      position: number;
      url: string;
    }>;
  };
}

/**
 * Breadcrumb navigation entity
 */
export interface BreadcrumbListSchema extends SchemaBase {
  "@type": "BreadcrumbList";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    item: {
      "@id": string;
      name: string;
    };
  }>;
}

/**
 * ProfilePage entity for personal profile pages
 */
export interface ProfilePageSchema extends SchemaBase {
  "@type": "ProfilePage";
  name?: string;
  description?: string;
  dateCreated: PacificDateString;
  dateModified: PacificDateString;
  datePublished?: PacificDateString;
  mainEntity: {
    "@type": "Person";
    name: string;
    alternateName?: string;
    identifier?: string;
    description: string;
    image?: string;
    sameAs?: string[];
    interactionStatistic?: Array<{
      "@type": "InteractionCounter";
      interactionType: string;
      userInteractionCount: number;
    }>;
    agentInteractionStatistic?: {
      "@type": "InteractionCounter";
      interactionType: string;
      userInteractionCount: number;
    };
  };
}

/**
 * NewsArticle entity for news-style blog posts
 */
export interface NewsArticleSchema extends SchemaBase {
  "@type": "NewsArticle";
  headline: string;
  image: string[];
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  author: Array<{
    "@type": "Person";
    name: string;
    url?: string;
  }>;
  description?: string;
  mainEntityOfPage?: { "@id": string };
  publisher?: { "@id": string };
}

/**
 * SoftwareApplication entity for software and extensions
 */
export interface SoftwareApplicationSchema extends SchemaBase {
  "@type": "SoftwareApplication";
  name: string;
  description?: string;
  operatingSystem?: string;
  applicationCategory?: string;
  offers?: {
    "@type": "Offer";
    price: number;
    priceCurrency?: string;
    availability?: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    ratingCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  downloadUrl?: string;
  softwareVersion?: string;
  screenshot?: string | string[];
  author?:
    | { "@id": string }
    | {
        "@type": "Person" | "Organization";
        name: string;
        url?: string;
      };
  publisher?:
    | { "@id": string }
    | {
        "@type": "Person" | "Organization";
        name: string;
        url?: string;
      };
}

/**
 * Complete schema graph structure
 */
export interface SchemaGraph {
  "@context": "https://schema.org";
  "@graph": Array<
    | WebPageBase
    | ArticleSchema
    | PersonSchema
    | ImageObjectSchema
    | WebSiteSchema
    | BreadcrumbListSchema
    | DatasetSchema
    | CollectionPageSchema
    | ProfilePageSchema
    | NewsArticleSchema
    | SoftwareApplicationSchema
  >;
}

/**
 * Parameters for generating page schemas
 */
export interface SchemaParams {
  path: string;
  title: string;
  description: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  image?: {
    url: string;
    width?: number;
    height?: number;
    caption?: string;
  };
  images?: string[];
  breadcrumbs?: Array<{
    path: string;
    name: string;
  }>;
  articleBody?: string;
  keywords?: string[];
  authors?: Array<{
    name: string;
    url?: string;
  }>;
  mainEntityOfPage?: { "@id": string };
  type?:
    | "article"
    | "profile"
    | "collection"
    | "dataset"
    | "newsarticle"
    | "software"
    | "bookmark-item"
    | "bookmark-collection";
  itemList?: Array<{ url: string; position: number }>;
  profileMetadata?: {
    bio?: string;
    alternateName?: string;
    identifier?: string;
    profileImage?: string;
    interactionStats?: {
      follows?: number;
      likes?: number;
      posts?: number;
    };
  };
  softwareMetadata?: {
    name: string;
    operatingSystem?: string;
    applicationCategory?: string;
    price?: number;
    priceCurrency?: string;
    isFree?: boolean;
    ratingValue?: number;
    ratingCount?: number;
    downloadUrl?: string;
    softwareVersion?: string;
    screenshot?: string | string[];
  };
}
