/**
 * Experience Feature Components
 * @module components/features/experience
 * @description
 * Server-side rendered experience section that displays professional history.
 * Uses server components for data fetching and pre-rendering of experience cards.
 *
 * @see {@link "app/experience/page.tsx"} - Experience page implementation
 * @see {@link "data/experience.ts"} - Experience data source
 * @see {@link "types/experience.ts"} - Experience type definitions
 */

/**
 * Experience component - Server-side rendered
 * Implements async server component pattern:
 * - Pre-renders experience cards on the server
 * - Handles data fetching and processing
 * - Uses force-static generation for optimal performance
 *
 * @see {@link "components/features/experience/experience.tsx"} - Server component implementation
 * @see {@link "components/ui/experience-card/experience-card.server.tsx"} - Card component
 */
export { Experience } from './experience';
