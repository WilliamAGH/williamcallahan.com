/**
 * Social Icons Component
 * 
 * Renders a collection of social media links with icons.
 * Provides consistent styling and accessibility features.
 */

"use client";

import { SocialIcon } from './social-icon';
import { socialLinks } from './social-links';

export function SocialIcons() {
  return (
    <div className="flex items-center space-x-4">
      {socialLinks.map((social) => (
        <SocialIcon
          key={social.label}
          {...social}
        />
      ))}
    </div>
  );
}