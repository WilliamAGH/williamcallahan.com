/**
 * SEO Feature Component Props
 *
 * SCOPE: SEO and metadata component props and interfaces
 * USAGE: Use for meta tags, JSON-LD, OpenGraph, and related SEO components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model rather than recreating similar structures.
 *
 * @see types/ui.ts for generic UI component props
 */

/**
 * JSON-LD script component props
 * @usage - Embedding structured data in pages
 */
export interface JsonLdScriptProps {
  /** JSON-LD data object */
  data: object;
  /** Optional DOM id for deduplication */
  id?: string;
}

/**
 * OpenGraph logo component props
 * @usage - OpenGraph logo meta tags
 */
export interface OpenGraphLogoProps {
  /** Custom logo URL - defaults to profile image */
  logoUrl?: string;
}
