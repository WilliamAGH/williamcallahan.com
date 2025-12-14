/**
 * Form and Input Component Types
 *
 * SCOPE: Types for form elements, links, and other input controls.
 */
import type { ReactNode, HTMLAttributes } from "react";

export interface ExternalLinkProps extends HTMLAttributes<HTMLAnchorElement> {
  /** Link URL */
  href: string;
  /** Link text or content */
  children: ReactNode;
  /** Whether to show external link icon */
  showIcon?: boolean;
  /** Custom icon component */
  icon?: ReactNode;
  /** If true, uses the raw title attribute value instead of the default formatted one */
  rawTitle?: boolean;
}
