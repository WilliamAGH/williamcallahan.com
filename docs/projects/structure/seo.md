# SEO Architecture Map

## Overview

The "seo" functionality manages search engine optimization by generating metadata, structured data (`JSON-LD`), `robots.txt`, and `sitemap.xml`. It is a comprehensive system designed to improve search engine visibility and social media presence. The system now includes Zod validation to ensure metadata adheres to SEO best practices.

## Core Logic & Orchestration

- **`lib/seo/index.ts`**: Central module that serves dual purposes:
  - **Barrel Export**: Re-exports all SEO utilities, types, and validation functions from sub-modules
  - **Core Functions**: Contains functions like `getStaticPageMetadata` and `getBlogPostMetadata` that generate final `Next.js` metadata objects
  - **Metadata Re-exports**: Provides convenient access to metadata configuration from `data/metadata.ts`
  - **Validation Re-exports**: Exports validation schemas and functions from `types/seo/metadata.ts`
- **`lib/seo/metadata.ts`**: Generates the main metadata structure for different content types (articles, static pages, software), including titles, descriptions, and Twitter cards. It also integrates the schema graph from `schema.ts` and OpenGraph data from `opengraph.ts`.
- **`data/metadata.ts`**: Acts as the single source of truth for all base metadata values, such as site title, author, and social media handles. Note: Contains incorrect GitHub username "williamcallahan" that should be "WilliamAGH".

## Sub-Modules

### Structured Data (JSON-LD)

- **`lib/seo/schema.ts`**: Responsible for generating a `@graph` of interconnected `JSON-LD` entities. It contains individual functions (`createPersonEntity`, `createArticleEntity`, etc.) to build different schema types.
- **`types/seo/schema.ts`**: Provides strongly-typed interfaces for all supported Schema.org entities and the parameters (`SchemaParams`) required to build them.

### OpenGraph

- **`lib/seo/opengraph.ts`**: Creates OpenGraph-specific metadata objects, ensuring correct formatting for social media previews, particularly for articles.
- **`types/seo/opengraph.ts`**: Defines TypeScript types for different OpenGraph object types (`ArticleOpenGraph`, `ProfileOpenGraph`).

### Site Indexing

- **`app/robots.ts`**: Dynamically generates the `robots.txt` file using a server-side route handler.
- **`app/sitemap.ts`**: Dynamically generates the `sitemap.xml` file, pulling data from various sources to list all indexable pages.
- **`scripts/submit-sitemap.ts`**: A utility script to programmatically submit the generated sitemap to search engines.

### Metadata Validation

- **`types/seo/metadata.ts`**: Now includes comprehensive Zod validation schemas alongside type definitions:
  - **SEO_LIMITS**: Constants defining optimal character lengths for various metadata fields
  - **Validation Schemas**: `metadataSchema`, `profilePageMetadataSchema`, `collectionPageMetadataSchema`, etc.
  - **Validation Functions**: `validateMetadata()`, `validatePageMetadata()`, `safeValidateMetadata()`
  - **Benefits**: Ensures metadata adheres to SEO best practices, enforces character limits, validates URLs, and provides helpful error messages

### Supporting Files

- **`lib/seo/constants.ts`**: Centralizes constant values, such as standard field names for metadata, to ensure consistency.
- **`lib/seo/utils.ts`**: Provides helper functions for date formatting (`formatSeoDate`) and URL normalization (`ensureAbsoluteUrl`).
- **`components/seo/json-ld.tsx`**: A simple React component that renders the `JSON-LD` schema into a `<script>` tag in the page's head.
- **Type Definitions (`types/seo/*.ts`)**: A suite of type files that ensure type safety across the entire SEO module. `types/seo.ts` serves as an aggregator, re-exporting types from the other files in its directory.

## Data Flow for a Blog Post

1. `[slug]/page.tsx` calls `getBlogPostMetadata` from `lib/seo/index.ts`.
2. `getBlogPostMetadata` fetches post data and calls `createArticleMetadata` in `lib/seo/metadata.ts`.
3. `createArticleMetadata` orchestrates calls to:
    - `generateSchemaGraph` (`lib/seo/schema.ts`) to build the `JSON-LD` graph.
    - `createArticleOgMetadata` (`lib/seo/opengraph.ts`) to get OpenGraph data.
    - `formatSeoDate` (`lib/seo/utils.ts`) to format timestamps.
4. The aggregated metadata is returned as a `Next.js` `Metadata` object to the page, which Next.js then uses to render the final `<head>` section of the HTML document.

This modular architecture ensures a clear separation of concerns, making the SEO system robust and maintainable.

## Example Usage

### Importing from the Barrel Export

```typescript
// Import everything SEO-related from one place
import { 
  SITE_NAME, 
  createArticleMetadata,
  validateMetadata,
  SEO_LIMITS 
} from '@/lib/seo';

// Validate metadata configuration
const validationResult = safeValidateMetadata(metadata);
if (!validationResult.success) {
  console.error('Metadata validation errors:', validationResult.errors);
}
```

### Validating Page Metadata

```typescript
import { validatePageMetadata } from '@/lib/seo';

// This will throw if validation fails
const validatedHomeMetadata = validatePageMetadata('home', {
  title: 'My Site',
  description: 'A great website',
  dateCreated: '2024-01-01T00:00:00Z',
  dateModified: '2024-01-01T00:00:00Z',
  bio: 'Welcome to my site',
});
```

## Notes

- The SEO functionality is critical for improving the application's discoverability and user engagement through search engines and social media platforms.
- The modular structure allows for easy updates to metadata standards and integration with various parts of the application, ensuring consistent SEO practices.
- Validation ensures metadata adheres to SEO best practices, preventing common mistakes like titles that are too long or missing required fields.
- The barrel export pattern in `lib/seo/index.ts` provides a clean API for consuming SEO functionality throughout the application.
