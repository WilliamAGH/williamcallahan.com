# Blog Article Architecture Map

## Overview

The "blog-article" functionality encompasses components and utilities that manage the rendering and interaction of individual blog articles. This includes detailed views of blog content with specialized elements for formatting and user engagement.

## Key Files and Responsibilities

### Components

- **components/features/blog/standard-tweet-embed.client.tsx**: A component for embedding tweets in blog articles using a standard approach.
- **components/features/blog/tweet-embed.tsx**: Embeds tweets using react-tweet with same-origin image proxying; proxied images set `unoptimized` to bypass the Next.js image optimizer.
- **components/features/blog/blog-article/blog-article.client.tsx**: Server-owned article shell for content and metadata; interactive descendants retain focused client boundaries.
- **components/features/blog/blog-article/blog-wrapper.tsx**: Legacy unreferenced dynamic wrapper; it is not part of the blog detail route.
- **components/features/blog/blog-article/\***: Blog article components are imported directly from concrete files (barrel removed).
- **components/features/blog/blog-article/mdx-content.tsx**: Server/client handoff for serialized blog MDX.
- **components/features/blog/blog-article/mdx-content.client.tsx**: Cached manual evaluator for the serialized source. It intentionally avoids importing `next-mdx-remote`'s `MDXRemote` client component, so its idle-callback polyfill cannot patch browser globals.
- **components/features/blog/blog-article/software-schema.tsx**: Inserts SoftwareApplication schema.org metadata for SEO in blog articles.
- **components/features/blog/blog-article/mdx-table.server.tsx**: Server-side component for styled table rendering in MDX content.
- **components/ui/simple-tabs.client.tsx**: A client-side component that enhances tab functionality for MDX content in blog articles, adding interactivity to switch between tabs dynamically.
- **components/ui/simple-tabs.css**: Provides styling for tab functionality in MDX content, managing tab panel visibility and button styles for active and hover states in both light and dark themes.

### API Routes

- **app/api/posts/route.ts**: API endpoint for blog post data retrieval.
  - Properly sanitizes blog posts before sending to client
  - Removes sensitive fields like `filePath` and `rawContent`
  - Different cache headers for dev vs production
  - Returns posts array with count
  - Handles errors with proper formatting
- **app/api/twitter-image/[...path]/route.ts**: API route for proxying Twitter images used in blog article embeds.
  - Accepts extensionless `media/<id>?format=<image-format>` URLs emitted by Twitter
  - Tweet image components set `unoptimized` because the same-origin route handles delivery without the Next.js image optimizer
  - Delegates Twitter path and format policy to `twitter-image-policy.ts`; the route validates the `name` parameter
  - Uses 7-day browser caching with 1-day stale-while-revalidate and 1-year immutable CDN-edge caching
  - Redirects persisted images to the CDN or returns buffered image responses

### Pages

- **app/blog/[slug]/page.tsx**: Individual blog post page
  - Implements ISR with 1-hour revalidation
  - Special handling for software-related posts
  - Validates slugs via `isValidBlogSlug()` guard before entering cache-wrapped lookups, enforcing the cache-key eligibility contract
  - Owns route-scoped metadata/content caches and establishes Suspense before awaiting params
- **app/blog/tags/[tagSlug]/page.tsx**: Tag filtering page

### Content Files

- **data/blog/posts/\*.mdx**: Blog post content files (28 posts)
  - Written in MDX format (Markdown with JSX)
  - Includes frontmatter metadata (title, author, date, tags, etc.)
  - Can embed React components like tabs, tweets, and custom elements
  - Posts cover technical topics, tutorials, and insights
  - Processed by MDX compiler with custom plugins

### Libraries

- **lib/blog.ts**: Main blog data management
  - Retrieves posts from the canonical MDX source
  - Proper error handling and logging
- **lib/blog/mdx.ts**: MDX processing utilities
  - Compiles validated repository MDX with `next-mdx-remote@6.0.0`, `blockJS: false`, and `blockDangerousJS: true`
  - Uses `remark-gfm@4.0.1`, the MDX 3/Unified-compatible retrofit that replaces v2's removed-`this.setData` path
  - Integrates with tagged Next.js caches
  - Supports lightweight metadata reads that skip compilation and blur generation
- **types/schemas/blog-frontmatter.ts**: Canonical Zod owner for MDX frontmatter, slug syntax, and the PostgreSQL mutation input.
- **lib/blog/validation.ts**: Parses frontmatter through the canonical schema and owns the cached canonical-slug file index plus route/cache lookup guard.
- **lib/utils/tag-utils.ts**: A suite of utility functions for formatting, normalizing, and sanitizing tags, including functions to convert tags to URL-friendly slugs (`tagToSlug`) and back (`slugToTagDisplay`).

## Logic Flow and Interactions

- Blog article content starts in **app/blog/[slug]/page.tsx**, which renders the server-owned **blog-article.client.tsx** shell. Author, image, and MDX leaves retain their focused client boundaries.
- Content is serialized through **lib/blog/mdx.ts** and passed through
  **mdx-content.tsx** to the cached manual evaluator in **mdx-content.client.tsx**.
  It retains `next-mdx-remote`'s protected serialization settings without importing the
  package's globally patching client renderer, then uses components from the
  `interactive-containers` functionality (e.g., `CollapseDropdown`) and specialized
  components like **mdx-table.server.tsx** for server-side table rendering.
- Social media integration is handled by **standard-tweet-embed.client.tsx** and **tweet-embed.tsx**, with image proxying supported by the API route **twitter-image/\[...path]/route.ts**.
- SEO is enhanced with structured data via **software-schema.tsx** for specific content types within articles.

## Notes

- The blog-article functionality focuses on delivering rich, interactive content with optimized performance through server-side rendering and client-side hydration.
- Responsive design is a key aspect, ensuring accessibility and usability across device sizes.
- Integration with external services for embeds and metadata enhances user engagement and search visibility.

## Blog Article Components

**Functionality:** `blog-article`

## Core Objective

The `blog-article` functionality provides all the necessary components to render a single blog post page, including the article content itself, metadata, and specialized, interactive UI elements within the post body like responsive tables and tabs.

## Architecture & Key Components

The components work together to enrich static MDX content with dynamic, client-side interactivity and responsive layouts. See `blog-article.mmd` for a visual diagram.

### 1. `components/ui/simple-tabs.client.tsx` & `simple-tabs.css`

- **Responsibility:** To progressively enhance a static HTML structure into a fully interactive tabbed interface.
- **Logic (`SimpleTabsEnhancer`):**
  - This component renders `null` and runs a `useEffect` hook on the client.
  - It searches the DOM for elements with the class `.mdx-tab-group`.
  - It attaches `click` event listeners to buttons within the group (`.mdx-tab-button`).
  - When a button is clicked, it updates a `data-active-tab` attribute on the parent group.
- **Styling (`simple-tabs.css`):**
  - The CSS uses the `data-active-tab` attribute to control the visibility of the corresponding tab panel (`display: block`).
  - **Limitation:** The CSS selectors are hardcoded to specific tab IDs (`pnpm`, `bun`, `npm`, `yarn`), meaning the component only works for these exact tabs out-of-the-box.

## Performance Considerations

1. **MDX Processing**
   - Canonical frontmatter slugs resolve through a file index, even when filenames differ
   - Concurrent post processing uses `Promise.all`
   - Tagged Next.js caches cover individual posts and the complete post inventory
   - `generateMetadata()` should use `getPostMetaBySlug()` (skips MDX compilation + blur generation)

2. **Image Handling**
   - Twitter image proxy with 7-day browser caching and 1-day stale-while-revalidate
   - One-year immutable CDN-edge caching
   - CDN redirects or buffered same-origin responses bypass the Next.js image optimizer

3. **Static Generation**
   - ISR with 1-hour revalidation
   - `generateStaticParams()` uses `getAllPostsMeta()` to avoid heavy MDX work at build time
   - Proper use of Next.js `notFound()` for missing content

## Data Flow & State Management

A typical blog article page follows this data flow:
