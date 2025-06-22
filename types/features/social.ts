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

// Use base component props
export type SocialCardProps = import("../ui").BaseComponentProps & {
  social: SocialLink;
  showStats?: boolean;
};

// Type extension
export type SocialCardClientProps = SocialCardProps & {
  interactive?: boolean;
  onClick?: (social: SocialLink) => void;
};

// Use generic WindowProps
export type SocialWindowProps = import("../component-types").WindowProps<{ socialLinks: SocialLink[] }>;

// Extend window props
export type SocialWindowClientProps = SocialWindowProps & {
  interactive?: boolean;
  onClose?: () => void;
};

// Simple type
export type SocialWindowContentProps = {
  children: ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  hasMounted: boolean;
};

// Simple type
export type OgImageApiResponse = {
  profileImageUrl?: string;
  domainImageUrl?: string;
};
