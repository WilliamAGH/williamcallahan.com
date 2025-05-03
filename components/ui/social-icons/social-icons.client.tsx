/**
 * Social Icons Component
 *
 * Displays social media icons with links to the author's profiles.
 */

"use client";

import React from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '../error-boundary.client';
import { IconWrapper } from '@/components/utils/icon-wrapper.client';
import { socialLinks } from './social-links';
import type { SocialLink } from '@/types/social';

interface SocialIconsProps {
  className?: string;
  showXOnly?: boolean;
}

// Simple hook to detect client-side mounting
function useHasMounted() {
  const [hasMounted, setHasMounted] = React.useState(false);
  
  React.useEffect(() => {
    // Add a small delay to ensure all DOM elements are ready
    // This helps with mobile-specific hydration issues
    const timer = setTimeout(() => {
      setHasMounted(true);
    }, 10);
    
    return () => clearTimeout(timer);
  }, []);
  
  return hasMounted;
}

export function SocialIcons({ className = '', showXOnly = false }: SocialIconsProps) {
  const hasMounted = useHasMounted();
  
  // Icon button styling
  const iconButtonClasses = "p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all duration-200 ease-in-out hover:scale-110 active:scale-100";
  
  // Filter links based on showXOnly prop
  const linksToShow = showXOnly 
    ? socialLinks.filter(link => link.label === 'X (Twitter)')
    : socialLinks;
  
  // During server rendering and before hydration completes on client,
  // just render nothing with suppressHydrationWarning
  if (!hasMounted) {
    return <div className={`flex ${className}`} suppressHydrationWarning />;
  }
  
  // Only render the full component after mounting on the client
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {linksToShow.map((link) => (
        <ErrorBoundary key={link.href} silent>
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