/**
 * Main Navigation Component
 * 
 * Provides the primary navigation bar for the application.
 * Includes responsive mobile menu and proper spacing across all devices.
 */

"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { WindowControls } from './window-controls';
import { navigationLinks } from './navigation-links';
import { NavigationLink } from './navigation-link';

export function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <div className="flex-1">
      {/* Mobile Menu Button */}
      <div className="sm:hidden flex items-center">
        <WindowControls className="mr-2" />
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden sm:flex items-center">
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

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2">
          {navigationLinks.map((link) => (
            <NavigationLink
              key={link.path}
              currentPath={pathname}
              {...link}
              className="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setIsMenuOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}