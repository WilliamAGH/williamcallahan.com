/**
 * Social Icon Component Types
 *
 * SCOPE: Types for the social icon components.
 */
import type { ReactNode } from "react";
import type React from "react";

export interface SocialIcon {
  /** Icon identifier */
  name: string;
  /** Link URL */
  url: string;
  /** Icon color */
  color?: string;
  /** Custom icon component */
  icon?: ReactNode;
}

export interface BaseIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  viewBox?: string;
  "aria-label"?: string;
}

export interface SocialIconsProps {
  className?: string;
  showXOnly?: boolean;
}

export interface SocialIconGridProps {
  /** Array of social icons */
  icons: SocialIcon[];
  /** Icon size */
  size?: number;
  /** Custom CSS classes */
  className?: string;
  /** Whether to show labels */
  showLabels?: boolean;
}

/**
 * Props for the SocialIcon component
 * @usage - Individual social icon links with hover effects
 */
export interface SocialIconProps {
  /** Link URL */
  href: string;
  /** Accessible label for the icon */
  label: string;
  /** Icon component to render */
  icon: React.ComponentType<BaseIconProps>;
  /** Whether to emphasize this icon */
  emphasized?: boolean;
}
