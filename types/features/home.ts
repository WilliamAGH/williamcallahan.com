/**
 * Home Feature Component Props
 *
 * SCOPE: Home page and profile component props and interfaces
 * USAGE: Use for profile images, home layouts, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * existing domain models rather than recreating similar structures.
 * Example: Reuse common image props patterns from other components when possible.
 *
 * @see types/ui.ts for generic UI component props
 */

/**
 * Profile image component props
 * @usage - User profile images with optimization and display options
 */
export interface ProfileImageProps {
  /** Image source URL */
  src: string;
  /** Image alt text */
  alt: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** Whether to show border */
  showBorder?: boolean;
  /** Loading priority */
  priority?: boolean;
  /** Optional CSS classes */
  className?: string;
}
