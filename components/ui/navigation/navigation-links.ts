/**
 * Navigation Configuration
 *
 * This file contains the configuration for the navigation links.
 * It is used to generate the navigation links for the application.
 *
 * @module components/ui/navigation/navigation-links
 * It is a shared component (server and client)
 */

import type { NavigationLink } from '@/types/navigation';

export const navigationLinks: NavigationLink[] = [
  { name: 'Home', path: '/' },
  { name: 'Investments', path: '/investments' },
  { name: 'Experience', path: '/experience' },
  { name: 'Education', path: '/education' },
  { name: 'Projects Sandbox', path: '/projects' }, // Use plural to match rendered label
  { name: 'Bookmarks', path: '/bookmarks' },
  { name: 'Blog', path: '/blog' },
];
