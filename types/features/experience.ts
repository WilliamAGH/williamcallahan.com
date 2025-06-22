/**
 * Experience Feature Component Props
 *
 * SCOPE: Professional experience component props and interfaces
 * USAGE: Use for experience timelines, cards, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/experience.ts) rather than recreating similar structures.
 * Example: Use `experiences: Experience[]` instead of redefining experience properties inline.
 *
 * @see types/experience.ts for experience domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { Experience } from "../experience";
import type { JSX } from "react";

/**
 * Experience collection component props
 * @usage - Displaying professional experience with timeline functionality
 */
export interface ExperienceClientProps {
  /** Array of experience items */
  experiences: Experience[];
  /** Whether to show timeline */
  showTimeline?: boolean;
  /** Optional CSS classes */
  className?: string;
}

export interface Skill {
  name: string;
  level: number; // e.g., 1-5 scale
}

// --- START: Experience Card Component Props ---

/**
 * Props for the base ExperienceCard component.
 * This is a feature-specific component type.
 */
export interface ExperienceCardProps {
  /** Experience data */
  experience: {
    title: string;
    company: string;
    duration: string;
    description: string;
    technologies?: string[];
    logo?: string;
  };
  /** Custom CSS classes */
  className?: string;
  /** Whether to show technologies */
  showTechnologies?: boolean;
}

/**
 * Props for the client-side interactive ExperienceCard.
 */
export interface ExperienceCardClientProps extends ExperienceCardProps {
  /** Whether card is interactive */
  interactive?: boolean;
  /** Click callback */
  onClick?: () => void;
}

/**
 * Props for the ExperienceCardClient component (extended version)
 * @usage - Experience card with pre-fetched logo data
 */
export interface ExperienceCardExtendedProps extends Experience {
  /** Logo data containing URL and source information */
  logoData: import("../logo").LogoData;
}

// --- END: Experience Card Component Props ---

/**
 * Props for the Experience client component.
 */
export interface ExperienceProps {
  /**
   * An array of experience card objects. Each object should contain an `id`
   * and a pre-rendered `card` (JSX.Element) representing an experience item.
   */
  experienceCards: Array<{ id: string; card: JSX.Element }>;
}
