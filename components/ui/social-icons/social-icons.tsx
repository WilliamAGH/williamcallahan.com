/**
 * Social Icons Component
 *
 * Renders a collection of social media links with icons.
 * Provides consistent styling and accessibility features.
 */

"use client";

import { useState, useEffect } from 'react';
import { SocialIcon } from './social-icon';
import { socialLinks } from './social-links';
import { z } from 'zod';

export function SocialIcons() {
  // Use client-only rendering to avoid hydration mismatches completely
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Validate at runtime in the browser as a double-check
      setIsMounted(true);
    } catch (e) {
      // If validation fails (shouldn't happen due to the parse in social-links.ts)
      if (e instanceof z.ZodError) {
        console.error('Social links validation error:', e.errors);
        setError('Invalid social links configuration');
      } else {
        console.error('Unexpected error in SocialIcons:', e);
        setError('Failed to load social icons');
      }
    }
  }, []);

  // Don't render anything during SSR or before hydration
  if (!isMounted) {
    return null;
  }

  // Show error if validation failed
  if (error) {
    return null; // or a fallback UI for errors
  }

  // Only render on the client
  return (
    <div className="flex items-center px-2 py-1.5 rounded-full bg-gray-100/50 dark:bg-gray-800/30 backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 ml-2 shrink-0 gap-x-0.5">
      {socialLinks.map((social) => (
        <SocialIcon
          key={social.label}
          {...social}
        />
      ))}
    </div>
  );
}