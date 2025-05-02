/**
 * Social Icons Component
 *
 * Displays social media icons with links to the author's profiles.
 */

"use client";

import React from 'react';
import Link from 'next/link';
import { X } from './x-icon'; // Re-add direct import for X icon
import { GitHub } from './github-icon'; // Re-add direct import for GitHub icon
import { ErrorBoundary } from '../error-boundary.client';
import { IconWrapper } from '@/components/utils/icon-wrapper.client';
import { socialLinks } from './social-links'; // Import the links data
import type { SocialLink } from '@/types/social'; // Import the type

interface SocialIconsProps {
  className?: string;
  showXOnly?: boolean;
}

/**
 * Social media icons with links
 * Each icon is wrapped in its own error boundary to prevent all icons
 * from failing if one has an issue
 */
export function SocialIcons({ className = '', showXOnly = false }: SocialIconsProps) {
  // Common classes for icon buttons - Add transition and scale effect on hover
  const iconButtonClasses =
    "p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200 ease-in-out hover:scale-110 active:scale-100"; // Added transition, scale, active state

  /**
   * IMPORTANT: Next.js handles client/server hydration as follows:
   * 1. Server renders the component first
   * 2. Client renders the component with the same props
   * 3. React compares the two and expects them to match
   * 
   * To solve hydration issues, we need to ensure IDENTICAL renders on server and client
   * until hydration completes. The solution:
   * - Don't render ANY content server-side (return null with suppressHydrationWarning)
   * - Create placeholder structures with NO CONTENT during initial render
   * - Only render actual content after hydration completes
   */
  
  // First check if we're in browser
  const isBrowser = typeof window !== 'undefined';
  
  // Track if component is mounted (client-side only state)
  const [isHydrated, setIsHydrated] = React.useState(false);
  
  // Set hydrated flag after initial render (client-side only)
  React.useEffect(() => {
    setIsHydrated(true);
  }, []);
  
  // Filter links based on showXOnly prop (happens on both server and client)
  const filteredLinks = React.useMemo(() => {
    if (showXOnly) {
      // When showXOnly is true, we want the X/Twitter link
      const twitterLink = socialLinks.find(link => link.label === 'X (Twitter)');
      return twitterLink ? [twitterLink] : [];
    }
    return socialLinks;
  }, [showXOnly]);

  // Server-side and initial client render: empty container with the same structure
  // This prevents hydration mismatch by ensuring both server and client render the same empty structure
  if (!isBrowser || !isHydrated) {
    return (
      <div className={`flex items-center space-x-1 ${className}`} suppressHydrationWarning />
    );
  }

  // Only displayed after hydration is complete (client-side only) to avoid mismatches
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {filteredLinks.map((link: SocialLink) => (
        <ErrorBoundary key={link.label} silent>
          <Link
            href={link.href}
            className={iconButtonClasses}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            <IconWrapper icon={link.icon} className="w-5 h-5" />
          </Link>
        </ErrorBoundary>
      ))}
    </div>
  );
}