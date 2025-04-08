/**
 * Navigation Configuration
 */

import type { NavigationLink } from '@/types/navigation';

export const navigationLinks: NavigationLink[] = [
  { name: 'Home', path: '/' },
  { name: 'Investments', path: '/investments' },
  { name: 'Experience', path: '/experience' },
  { name: 'Education', path: '/education' },
  { name: 'Project Sandbox', path: '/projects' }, // Changed name
  { name: 'Blog', path: '/blog' },
];
