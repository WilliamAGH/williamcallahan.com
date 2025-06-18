/**
 * OpenGraph SEO Types
 * @module types/seo/opengraph
 * @description
 * Type definitions specific to OpenGraph metadata.
 */

import type { OpenGraph } from "next/dist/lib/metadata/types/opengraph-types";
import type { OpenGraphImage, PacificDateString } from "./shared";

/**
 * OpenGraph article metadata structure
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 */
export type ArticleOpenGraph = OpenGraph & {
  type: "article";
  article: {
    publishedTime: PacificDateString;
    modifiedTime: PacificDateString;
    section?: string;
    tags?: string[];
    authors?: string[];
  };
  images?: OpenGraphImage[];
};

/**
 * OpenGraph profile metadata structure
 * @see {@link "https://ogp.me/#type_profile"} - OpenGraph profile specification
 */
export type ProfileOpenGraph = OpenGraph & {
  type: "profile";
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: string;
  images?: OpenGraphImage[];
  profile?: {
    publishedTime?: PacificDateString;
    modifiedTime?: PacificDateString;
  };
};

/**
 * OpenGraph website metadata structure
 * @see {@link "https://ogp.me/#type_website"} - OpenGraph website specification
 */
export type WebsiteOpenGraph = OpenGraph & {
  type: "website";
  images?: OpenGraphImage[];
  website?: {
    publishedTime?: PacificDateString;
    modifiedTime?: PacificDateString;
  };
};

/**
 * Combined OpenGraph types
 */
export type ExtendedOpenGraph = ArticleOpenGraph | ProfileOpenGraph | WebsiteOpenGraph;
