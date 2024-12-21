/**
 * Social Media Types
 * 
 * Type definitions for social media links and icons.
 */

import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export interface SocialIconProps {
  readonly href: string;
  readonly label: string;
  readonly icon: ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>;
}

export type SocialLink = SocialIconProps;