/**
 * SEO Field Name Constants
 * @module lib/seo/constants
 * @description
 * Defines structural constants for SEO metadata field names.
 * These constants define the standard field names used across different metadata formats.
 *
 * Note: Actual metadata values are defined in data/metadata.ts
 *
 * @see {@link "../../data/metadata.ts"} - Source of metadata values
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specifications
 * @see {@link "https://schema.org/Article"} - Schema.org article specifications
 * @see {@link "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name"} - HTML meta name specifications
 */

/**
 * SEO Date Field Names
 * Central source of truth for all date-related metadata field names.
 * These fields must be used consistently across all metadata implementations.
 *
 * @see {@link "../metadata.ts"} - Usage in metadata generation
 * @see {@link "../opengraph.ts"} - Usage in OpenGraph metadata
 * @see {@link "../../types/seo.ts"} - Type definitions
 */
/**
 * Date field names for various metadata standards
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/dateModified"} - Schema.org date properties
 * @see {@link "https://dublincore.org/specifications/dublin-core/dcmi-terms/#created"} - Dublin Core dates
 */
// SEO_DATE_FIELDS constant has been moved to types/seo.ts to break circular dependency

// Type definitions for these parameters are now located in `types/seo.ts`.

// Re-export types (breaking circular dependency by importing directly from types)
export type { ArticleParams, SoftwareAppParams } from "../../types/seo";

export { SEO_DATE_FIELDS } from "../../types/seo";
