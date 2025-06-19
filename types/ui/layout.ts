/**
 * Layout Component Types
 *
 * SCOPE: Types for layout and structural components.
 */
import type { ReactNode } from "react";

export interface BackgroundInfoProps {
  /** Information content */
  children: ReactNode;
  /** Info title */
  title?: string;
  /** Whether info is visible */
  visible?: boolean;
  /** Custom CSS classes */
  className?: string;
}

export interface LocalBackgroundInfoProps extends BackgroundInfoProps {
  /** Optional icon to display (defaults to InfoIcon). */
  icon?: ReactNode;
}

export interface PageTransitionWrapperProps {
  /** Page content */
  children: ReactNode;
  /** Transition key */
  transitionKey?: string;
  /** Custom CSS classes */
  className?: string;
}
