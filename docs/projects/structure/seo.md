# SEO Architecture Map

## Overview

The "seo" functionality manages search engine optimization by generating metadata, structured data (`JSON-LD`), `robots.txt`, `sitemap.xml`, and automated sitemap submissions to search engines. It is a comprehensive system designed to improve search engine visibility and social media presence. The system includes Zod validation to ensure metadata adheres to SEO best practices and automated submission workflows for Google Search Console and Bing IndexNow.

> **💡 Note on Google Indexing API**  
> While the Google Indexing API exists for faster indexing, it's currently limited to `JobPosting` and `BroadcastEvent` schema types. For general content like blog posts, standard sitemap submissions to Google Search Console remain the recommended approach, which this project implements.

## Core Logic & Orchestration

- **`lib/seo/index.ts`**: Central module that serves dual purposes:
  - **Barrel Export**: Re-exports all SEO utilities, types, and validation functions from sub-modules
  - **Core Functions**: Contains functions like `getStaticPageMetadata` and `getBlogPostMetadata` that generate final `Next.js` metadata objects
  - **Metadata Re-exports**: Provides convenient access to metadata configuration from `data/metadata.ts`
  - **Validation Re-exports**: Exports validation schemas and functions from `types/seo/metadata.ts`
- **`lib/seo/metadata.ts`**: Generates the main metadata structure for different content types (articles, static pages, software), including titles, descriptions, and Twitter cards. It also integrates the schema graph from `schema.ts` and OpenGraph data from `opengraph.ts`.
- **`data/metadata.ts`**: Acts as the single source of truth for all base metadata values, such as site title, author, and social media handles.

## Sub-Modules

### Structured Data (JSON-LD)

- **`lib/seo/schema.ts`**: Responsible for generating a `@graph` of interconnected `JSON-LD` entities. It contains individual functions (`createPersonEntity`, `createArticleEntity`, etc.) to build different schema types.
- **`types/seo/schema.ts`**: Provides strongly-typed interfaces for all supported Schema.org entities and the parameters (`SchemaParams`) required to build them.

### OpenGraph

- **`lib/seo/opengraph.ts`**: Creates OpenGraph-specific metadata objects, ensuring correct formatting for social media previews, particularly for articles.
- **`types/seo/opengraph.ts`**: Defines TypeScript types for different OpenGraph object types (`ArticleOpenGraph`, `ProfileOpenGraph`).

### Site Indexing & Submission

#### Generation

- **`app/robots.ts`**: Dynamically generates the `robots.txt` file using a server-side route handler
  - Production: Allows all crawlers, blocks sensitive paths (`/api/`, `/debug/`)
  - Non-production: Blocks all crawlers to prevent indexing of staging sites
- **`app/sitemap.ts`**: Dynamically generates the `sitemap.xml` file at build time
  - Includes: Blog posts, tags, bookmarks, static pages
  - Priorities: Home (1.0), Investments/Projects (0.9), Experience/Education (0.8), Blog/Bookmarks (0.7)
  - Uses frontmatter dates for `lastModified` when available

#### Automated Submission

- **`scripts/submit-sitemap.ts`**: Programmatically submits sitemaps to search engines
  - **Google Search Console**: Uses Webmasters API v3 with Service Account authentication
  - **Bing IndexNow**: Simple GET request with API key verification
  - Features:
    - Production-only execution (checks `NODE_ENV` and `SITE_URL`)
    - Rate limiting (1 second delay between submissions)
    - Retry mechanism with exponential backoff
    - Command line options: `--sitemaps-only`, `--individual-only`, `--all`
- **`scripts/scheduler.ts`**: Orchestrates automated tasks
  - Bookmark refresh: Every 2 hours → triggers sitemap submission
  - **Distributed-Lock Aware**: Before starting a refresh it attempts to acquire the `bookmarks/refresh-lock*.json` object in S3. If another
    instance already holds the lock the scheduler skips this cycle to avoid double-refreshing and duplicate sitemap submissions.
  - GitHub activity: Daily at midnight PT
  - Logo updates: Weekly on Sunday at 1 AM PT
  - Uses `node-cron` with jitter for load distribution

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

## Sitemap Generation Details

### Content Sources

The `app/sitemap.ts` file aggregates content from multiple sources:

1. **Static Pages**: Manually defined routes with fixed priorities
2. **Blog Posts**: Fetched from `data/blog/posts.ts` with frontmatter dates
3. **Blog Tags**: Dynamically generated from unique post tags
4. **Bookmarks**: Retrieved from cache or API with domain groupings
5. **Bookmark Tags**: Extracted from bookmark metadata
   - Main tag pages: `/bookmarks/tags/[tagSlug]`
   - Paginated tag pages: `/bookmarks/tags/[tagSlug]/page/[n]`
6. **Paginated Pages**:
   - Bookmark list pages: `/bookmarks/page/[n]`
   - Tag-filtered pages: `/bookmarks/tags/[tagSlug]/page/[n]`

### URL Construction

```typescript
// Example URL patterns generated
https://site.com/                    // Home (priority: 1.0)
https://site.com/blog/post-slug      // Blog posts (priority: 0.7)
https://site.com/blog/tags/tag-slug  // Blog tags (priority: 0.6)
https://site.com/bookmarks/[slug]              // Individual bookmarks (priority: 0.65)
https://site.com/bookmarks/page/2              // Paginated bookmarks (priority: 0.65)
https://site.com/bookmarks/tags/react-native   // Bookmark tags (priority: 0.6)
https://site.com/bookmarks/tags/ai-and-ml/page/2 // Paginated tag pages (priority: 0.55)
```

## Automated Submission Workflow

### Architecture

```mermaid
graph TD
    subgraph "Data Sources"
        A[Blog Posts] --> B[app/sitemap.ts]
        C[Bookmarks API] --> B
        D[Static Routes] --> B
    end

    subgraph "Build Process"
        B -->|Next.js Build| E[/sitemap.xml]
    end

    subgraph "Scheduler (scripts/scheduler.ts)"
        F[node-cron] -->|Every 2 hours| G[Bookmark Refresh]
        G -->|On Success| H[Submit Sitemap]
    end

    subgraph "Submission (scripts/submit-sitemap.ts)"
        H --> I{Production Check}
        I -->|Yes| J[Rate Limiter]
        J --> K[Google Client]
        J --> L[Bing Client]
    end

    subgraph "External APIs"
        K -->|Service Account| M[Google Search Console]
        L -->|API Key| N[Bing IndexNow]
    end

    style F fill:#f9f,stroke:#333,stroke-width:2px
    style I fill:#ccf,stroke:#333,stroke-width:2px
```

### Environment Configuration

| Variable | Description | Example | Required For |
|----------|-------------|---------|-------------|
| `GOOGLE_PROJECT_ID` | GCP project identifier | `my-project-123` | Google submission |
| `GOOGLE_SEARCH_INDEXING_SA_EMAIL` | Service account email | `sa@project.iam.gserviceaccount.com` | Google submission |
| `GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY` | Full private key with headers | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` | Google submission |
| `INDEXNOW_KEY` | Bing IndexNow API key | `abc123def456` | Bing submission |
| `SITE_URL` | Production site URL | `https://williamcallahan.com` | All submissions |
| `NODE_ENV` | Environment indicator | `production` | Production check |

### Setup Requirements

#### Google Search Console

1. Enable "Google Search Console API" in GCP
2. Create Service Account with JSON key
3. Add Service Account email to Search Console property with "Owner" permission
4. Store credentials in environment variables

#### Bing IndexNow

1. Generate unique key for `INDEXNOW_KEY`
2. Create verification file: `public/[KEY].txt` containing only the key
3. Ensure file is accessible at `https://site.com/[KEY].txt`

### Execution Flow

1. **Trigger**: Scheduler runs bookmark refresh every 2 hours
2. **Success Hook**: On successful refresh, triggers sitemap submission
3. **Production Check**: Verifies `NODE_ENV=production` and valid `SITE_URL`
4. **Rate Limiting**: 1-second delay between API calls
5. **Submission**:
   - Google: POST to Webmasters API with sitemap URL
   - Bing: POST request to IndexNow with JSON payload
6. **Error Handling**: Retry with exponential backoff on failure

## Operations & Maintenance

### Monitoring

- **Submission Logs**: Check console output from scheduler process
- **Google Search Console**: Verify sitemap status in web interface
- **Bing Webmaster Tools**: Monitor IndexNow submission results

### Manual Testing

```bash
# Test sitemap generation
bun run build
curl http://localhost:3000/sitemap.xml

# Test submission (dry run)
NODE_ENV=development bun run scripts/submit-sitemap.ts

# Force production submission (use with caution)
NODE_ENV=production SITE_URL=https://williamcallahan.com bun run scripts/submit-sitemap.ts --sitemaps-only
```

### Common Issues

1. **Missing Environment Variables**: Check all required vars are set
2. **Invalid Service Account**: Verify JSON key formatting and permissions
3. **IndexNow 403 Error**: Ensure verification file is publicly accessible
4. **Stale Sitemap**: Build process must complete before submission

## Special Character Handling in URLs

### Tag Slug Generation

The `tagToSlug` function handles special characters in tags to generate SEO-friendly URLs:

| Original Tag | Generated Slug | URL Path |
|--------------|----------------|-----------|
| `AI & ML` | `ai-and-ml` | `/bookmarks/tags/ai-and-ml` |
| `C++` | `c-plus-plus` | `/bookmarks/tags/c-plus-plus` |
| `C#` | `c-sharp` | `/bookmarks/tags/c-sharp` |
| `.NET` | `dotnet` | `/bookmarks/tags/dotnet` |
| `Node.js` | `nodedotjs` | `/bookmarks/tags/nodedotjs` |
| `Vue@3` | `vue-at-3` | `/bookmarks/tags/vue-at-3` |

### URL Safety

- All generated slugs are URL-safe (lowercase alphanumeric with hyphens)
- Unicode control characters are stripped
- Leading/trailing special characters are handled gracefully
- Empty or whitespace-only tags are filtered out

## Notes

- The SEO functionality is critical for improving the application's discoverability and user engagement through search engines and social media platforms
- The modular structure allows for easy updates to metadata standards and integration with various parts of the application
- Validation ensures metadata adheres to SEO best practices, preventing common mistakes
- The barrel export pattern in `lib/seo/index.ts` provides a clean API for consuming SEO functionality
- Automated submission runs only in production to prevent accidental submissions during development
- Special character handling in tags ensures all URLs are SEO-friendly and crawlable
