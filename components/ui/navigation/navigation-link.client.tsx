/**
 * Navigation Link Component
 */
"use client"; // Add "use client" as it uses hooks

import Link from 'next/link';
// Revert to original hook name
import { useTerminalContext } from '@/components/ui/terminal/terminal-context.client';
import type { NavigationLinkProps } from '@/types/navigation';
import { useCallback, useState, useEffect, useRef } from 'react'; // Import useRef

// Important pages that should be prefetched for faster navigation
const PRIORITY_PATHS = ['/projects', '/blog', '/experience', '/contact'];

// Navigation cooldown settings
const NAVIGATION_COOLDOWN = 300; // ms

export function NavigationLink({
  path,
  name,
  currentPath,
  className = '',
  onClick
}: NavigationLinkProps) {
  // Use the original hook name
  const { clearHistory } = useTerminalContext();
  const isActive = currentPath === path;
  // Use useRef to store the last navigation timestamp reliably across renders and tests
  const lastNavigationTimeRef = useRef(0);

  // Track navigation state
  const [isNavigating, setIsNavigating] = useState(false);

  // Determine if this link should be prefetched
  const shouldPrefetch = PRIORITY_PATHS.includes(path);

  // Memoize the click handler to prevent rerenders
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();

    // Prevent rapid navigation clicks (possible server switching)
    // Access and compare using the ref's current value
    if (now - lastNavigationTimeRef.current < NAVIGATION_COOLDOWN) {
      e.preventDefault();
      return;
    }

    // Update the ref's current value
    lastNavigationTimeRef.current = now;
    setIsNavigating(true);

    // Only clear history when actually navigating to a new page
    if (path !== currentPath) {
      // Clear history when navigating to a new page
      clearHistory();
    }
    onClick?.();
  }, [path, currentPath, onClick, clearHistory]); // Added clearHistory to dependency array

  // Reset navigation state after timeout
  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => {
        setIsNavigating(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isNavigating]);

  // Create link props conditionally to avoid passing false for prefetch
  const linkProps = {
    href: path,
    className: `
      px-4 py-2 rounded-t-lg text-sm
      nav-link
      ${isActive
        ? 'bg-white dark:bg-gray-800 shadow-sm border-t border-x border-gray-200 dark:border-gray-700'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }
      ${isNavigating ? 'pointer-events-none opacity-80' : ''}
      ${className}
    `,
    // Explicitly type aria-current to match the expected values
    'aria-current': isActive ? ('page' as const) : undefined,
    onClick: handleClick,

    // Let Next.js handle default prefetching behavior
    // prefetch: true, // Removed to avoid passing boolean to mock <a>

    // Add scroll restoration to prevent page position jumps.
    // scroll={false} is the correct prop for Next.js <Link> to disable scroll restoration.
    // React might show a dev warning because the underlying <a> tag doesn't typically
    // accept a boolean 'scroll' attribute. We prioritize Next.js functionality and
    // type safety over silencing this specific React dev warning.
    scroll: false
  };

  return (
    <Link {...linkProps}>
      {name}
    </Link>
  );
}
