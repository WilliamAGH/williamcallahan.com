/**
 * Blog Feature Components
 * @module components/features/blog
 * @description
 * Central export point for all blog-related components.
 * Implements a hybrid client/server architecture where:
 * - Blog component (client) handles UI rendering and interactions
 * - Data fetching happens in page component (server)
 *
 * @see {@link "app/blog/page.tsx"} - Server-side page component that fetches data
 * @see {@link "lib/blog/core.ts"} - Core blog data fetching utilities
 * @see {@link "types/blog.ts"} - Blog-related type definitions
 */

/**
 * Main Blog component - Client-side rendered
 * Uses 'use client' directive for client-side interactivity
 * Receives pre-fetched data through props from server component
 * @see {@link "components/features/blog/blog.tsx"}
 */
export { Blog } from './blog';

/**
 * Blog Article component for individual post pages
 * @see {@link "components/features/blog/blog-article/blog-article.tsx"}
 */
export { BlogArticle } from './blog-article';

/**
 * Blog List component for displaying post previews
 * @see {@link "components/features/blog/blog-list/blog-list.tsx"}
 */
export { BlogList } from './blog-list';

/**
 * Shared blog components (Author, Tags)
 * @see {@link "components/features/blog/shared"}
 */
export { BlogAuthor, BlogTags } from './shared';
