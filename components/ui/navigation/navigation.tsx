/**
 * Main Navigation Component
 *
 * Provides the primary navigation bar for the application.
 * Includes responsive mobile menu and proper spacing across all devices.
 */

"use client";

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { WindowControls } from './window-controls';
import { navigationLinks } from './navigation-links';
import { NavigationLink } from './navigation-link';
import { ThemeToggle } from '../theme-toggle';

export function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Update shouldRender based on menu state
  useEffect(() => {
    if (isMenuOpen) {
      setShouldRender(true);
    }
  }, [isMenuOpen]);

  const closeMenu = useCallback(() => {
    if (isMenuOpen) {
      setIsTransitioning(true);
      setIsMenuOpen(false);
    }
  }, [isMenuOpen]);

  // Handle cleanup and transitions
  useEffect(() => {
    const handleTransitionEnd = () => {
      setIsTransitioning(false);
      if (!isMenuOpen) {
        setShouldRender(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    if (isMenuOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen, closeMenu]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isMenuOpen && !target.closest('[data-testid="mobile-menu"]') && !target.closest('button')) {
        closeMenu();
      }
    };

    if (isMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isMenuOpen, closeMenu]);

  return (
    <nav className="flex-1">
      {/* Mobile Menu Button */}
      <div className="sm:hidden flex items-center relative z-30">
        <WindowControls className="mr-2" />
        <button
          type="button"
          onClick={() => {
            setIsTransitioning(true);
            setIsMenuOpen(!isMenuOpen);
          }}
          className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 touch-manipulation select-none"
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
      {shouldRender && (
        <div
          data-testid="mobile-menu"
          className={`sm:hidden fixed top-[60px] left-0 right-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 z-30 transform transition-transform duration-200 ease-in-out ${
            isMenuOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
          onTransitionEnd={(e) => {
            // Only handle transition end for this element
            if (e.target === e.currentTarget) {
              setIsTransitioning(false);
              if (!isMenuOpen) {
                setShouldRender(false);
              }
            }
          }}
        >
          {navigationLinks.map((link) => (
            <NavigationLink
              key={link.path}
              currentPath={pathname}
              {...link}
              className="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation select-none"
              onClick={() => closeMenu()}
            />
          ))}
        </div>
      )}

      {/* Overlay for closing menu when clicking outside */}
      {shouldRender && (
        <div
          className={`sm:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-20 touch-manipulation select-none transition-opacity duration-200 ${
            isMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
      )}
    </nav>
  );
}
