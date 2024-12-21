/**
 * Main Navigation Component
 * 
 * Provides the primary navigation bar for the application with:
 * - Responsive navigation links
 * - Active state highlighting
 * - MacOS-style window controls
 * - Consistent styling across light/dark modes
 */

"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WindowControls } from './window-controls';
import { navigationLinks } from './navigation-links';
import { NavigationLink } from './navigation-link';
import type { NavigationLinkProps } from '@/types/navigation';

export function Navigation() {
  const pathname = usePathname();
  
  return (
    <div className="flex-1 flex items-center">
      <WindowControls />
      <div className="flex space-x-1">
        {navigationLinks.map((link) => (
          <NavigationLink
            key={link.path}
            currentPath={pathname}
            {...link}
          />
        ))}
      </div>
    </div>
  );
}