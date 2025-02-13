/**
 * Feature Components Export Module
 * @module components/features
 * @description
 * Central export point for all major feature components of the application.
 * Handles both client and server components with specific patterns:
 * - Client components use 'use client' directive
 * - Server components use async functions
 * - Explicit .server/.client suffixes when both versions exist
 *
 * @see {@link "components/features/blog/blog.tsx"} - Client-side Blog implementation
 * @see {@link "components/features/experience/experience.tsx"} - Server-side Experience implementation
 * @see {@link "components/features/home/home.tsx"} - Client-side Home implementation
 * @see {@link "components/features/investments/investments.server.tsx"} - Server-side Investments implementation
 * @see {@link "docs/architecture/state-management.md"} - Component state management patterns
 */

/**
 * Blog component - Client-side rendered
 * Uses 'use client' directive for client-side interactivity
 * Implements hybrid client/server pattern:
 * - Client component handles UI and interactions
 * - Server-side page component handles data fetching
 * @see {@link "components/features/blog/blog.tsx"} - Client component implementation
 * @see {@link "app/blog/page.tsx"} - Server-side data fetching
 */
export { Blog } from './blog';

/**
 * Experience component - Server-side rendered
 * Implements async server component pattern:
 * - Pre-renders experience cards on the server
 * - Uses force-static generation for optimal performance
 * - Handles data fetching and processing server-side
 * @see {@link "components/features/experience/experience.tsx"} - Server component implementation
 * @see {@link "components/ui/experience-card/experience-card.server.tsx"} - Card component
 * @see {@link "data/experience.ts"} - Experience data source
 */
export { Experience } from './experience';

/**
 * Home component - Client-side rendered
 * Implements client component pattern:
 * - Uses 'use client' directive for client-side interactivity
 * - Handles responsive layout with Tailwind CSS
 * - Optimizes image loading with Next.js Image
 * @see {@link "components/features/home/home.tsx"} - Client component implementation
 * @see {@link "app/page.tsx"} - Home page with metadata
 * @see {@link "data/metadata.ts"} - Page metadata configuration
 */
export { Home } from './home';

/**
 * Investments component - Server-side rendered
 * Implements async server component pattern:
 * - Pre-renders investment cards on the server
 * - Uses force-dynamic rendering for real-time data
 * - Handles server-side data fetching and processing
 * @see {@link "components/features/investments/investments.server.tsx"} - Server component implementation
 * @see {@link "data/investments.ts"} - Investment data source
 * @see {@link "types/investment.ts"} - Investment type definitions
 */
export { Investments } from './investments/investments.server';
