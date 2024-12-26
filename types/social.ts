/**
 * Social Media Types
 * 
 * Type definitions for social media links and icons.
 */

import type { LucideIcon } from 'lucide-react';

export interface SocialIconProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export type SocialLink = SocialIconProps;