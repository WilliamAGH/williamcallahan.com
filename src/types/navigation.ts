/**
 * Navigation Link Configuration
 *
 * Supports both flat navigation items and nested hierarchies.
 * Nested items (children) are displayed as sub-menus on desktop (hover/click reveal)
 * and as indented expandable sections on mobile.
 */
export interface NavigationLink {
  /** Display name shown in the navigation */
  name: string;
  /** Route path - can be empty string for parent-only items */
  path: string;
  /** Responsive visibility settings */
  responsive?: {
    hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
    hideAbove?: "sm" | "md" | "lg" | "xl" | "2xl";
  };
  /** Child navigation items - creates a dropdown/expandable section */
  children?: NavigationLink[];
}

export interface NavigationLinkProps extends NavigationLink {
  currentPath: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Props for navigation items with expandable children
 */
export interface ExpandableNavItemProps {
  /** The parent navigation link */
  link: NavigationLink;
  /** Current route path for active state detection */
  currentPath: string;
  /** Whether this is in mobile menu context */
  isMobile?: boolean;
  /** Callback when any link is clicked (for closing mobile menu) */
  onLinkClick?: () => void;
}
