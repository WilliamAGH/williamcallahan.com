/**
 * Social Feature Component Props
 *
 * SCOPE: Social media and networking component props and interfaces
 * USAGE: Use for social cards, windows, feeds, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/social.ts) rather than recreating similar structures.
 * Example: Use `social: SocialLink` instead of redefining social properties inline.
 *
 * @see types/social.ts for social domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { ReactNode } from "react";
import type { SocialLink } from "../social";

/**
 * Social card component props
 * @usage - Individual social media profile/link cards
 */
export interface SocialCardProps {
  /** Social link data */
  social: SocialLink;
  /** Whether to show stats */
  showStats?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Interactive social card component props
 * @usage - Client-side social cards with click handlers
 */
export interface SocialCardClientProps extends SocialCardProps {
  /** Whether card is interactive */
  interactive?: boolean;
  /** Click callback */
  onClick?: (social: SocialLink) => void;
}

/**
 * Social window component props
 * @usage - Social links displayed in window-like UI
 */
export interface SocialWindowProps {
  /** Social links to display */
  socialLinks: SocialLink[];
  /** Window title */
  title?: string;
  /** Whether window is active */
  isActive?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Interactive social window component props
 * @usage - Client-side social windows with window controls
 */
export interface SocialWindowClientProps extends SocialWindowProps {
  /** Whether window is interactive */
  interactive?: boolean;
  /** Window callbacks */
  onClose?: () => void;
}

/**
 * Social window content component props
 * @usage - Content display within social windows with window controls
 */
export interface SocialWindowContentProps {
  /** Window content */
  children: ReactNode;
  /** Current window state */
  windowState: string;
  /** Close callback */
  onClose: () => void;
  /** Minimize callback */
  onMinimize: () => void;
  /** Maximize callback */
  onMaximize: () => void;
  /** Whether component has mounted (for hydration) */
  hasMounted: boolean;
}

/**
 * OpenGraph image API response structure
 * @usage - Response from og-image API endpoint
 */
export interface OgImageApiResponse {
  profileImageUrl?: string;
  domainImageUrl?: string;
}
