// components/ui/navigation/navigation.tsx

/**
 * Main Navigation Component
 *
 * Provides the primary navigation bar for the application with mobile-responsive menu.
 * Features touch gestures, keyboard navigation, and RTL support.
 * Implements proper cleanup and state management following Next.js 14 patterns.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, X } from "lucide-react";
import { WindowControls } from "./windowControls";
import { navigationLinks } from "./navigationLinks";
import { NavigationLink } from "./navigationLink";
import { ThemeToggle } from "../themeToggle";
import { FocusTrap } from "../focusTrap";
import { useTouchHandler } from "@/lib/hooks/useTouchHandler";
import type { NavigationMenuState } from "@/types/navigation";

const TRANSITION_DURATION = "200ms";

export function Navigation() {
  const pathname = usePathname();
  const [menuState, setMenuState] = useState<NavigationMenuState>("closed");
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Derived state
  const isMenuOpen = menuState === "open" || menuState === "opening";
  const shouldRender = menuState !== "closed";

  // Handle menu state changes
  const openMenu = useCallback(() => {
    setMenuState("opening");
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState("closing");
    if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, []);

  // Handle transition end
  const handleTransitionEnd = useCallback(() => {
    if (menuState === "opening") {
      setMenuState("open");
    } else if (menuState === "closing") {
      setMenuState("closed");
    }
  }, [menuState]);

  // Handle escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && isMenuOpen) {
      e.preventDefault();
      closeMenu();
    }
  }, [isMenuOpen, closeMenu]);

  // Handle click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      isMenuOpen &&
      menuRef.current &&
      !menuRef.current.contains(e.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(e.target as Node)
    ) {
      closeMenu();
    }
  }, [isMenuOpen, closeMenu]);

  // Event listeners
  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  useEffect(() => {
    if (isMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [handleClickOutside, isMenuOpen]);

  // Handle reduced motion preference
  const prefersReducedMotion = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const transitionDuration = prefersReducedMotion ? "0s" : TRANSITION_DURATION;

  // Handle RTL support
  const isRTL = typeof document !== "undefined"
    ? document.documentElement.dir === "rtl"
    : false;

  // Get theme state from next-themes
  const { theme, systemTheme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

  return (
    <nav aria-label="Main navigation" className="flex-1 " role="navigation">
      <div className="sm:hidden flex items-center relative z-30">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => isMenuOpen ? closeMenu() : openMenu()}
          className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 touch-manipulation select-none"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-controls="mobile-menu"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden sm:flex items-center">
        {/* Disabled: Window controls in navigation
        <WindowControls />
        */}
        <div className="flex space-x-1" role="list">
          {navigationLinks.map((link) => (
            <div key={link.path} role="listitem">
              <NavigationLink
                currentPath={pathname}
                {...link}
                aria-label={`Navigate to ${link.name}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {shouldRender && (
        <FocusTrap
          active={isMenuOpen}
          onEscape={closeMenu}
        >
          <div>
            <div
              ref={menuRef}
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              aria-hidden={!isMenuOpen}
              onTransitionEnd={handleTransitionEnd}
              className={`
                sm:hidden fixed top-[60px] ${isRTL ? "right-0" : "left-0"} right-0
                bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700
                py-2 z-30 transform transition-transform ease-out will-change-transform
                ${isMenuOpen ? 'translate-y-0' : '-translate-y-full'}
              `}
              style={{ transitionDuration: prefersReducedMotion ? '0ms' : '200ms' }}
            >
              <ul role="list" className="py-1">
                {navigationLinks.map((link) => (
                  <li key={link.path} role="listitem">
                    <NavigationLink
                      currentPath={pathname}
                      {...link}
                      aria-label={`Navigate to ${link.name}`}
                      className="block w-full px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation select-none"
                      onClick={closeMenu}
                    />
                  </li>
                ))}
              </ul>
            </div>
            {/* Backdrop */}
            <div
              aria-hidden="true"
              className={`
                sm:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-20
                touch-manipulation select-none transition-opacity
                ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
              `}
              style={{ transitionDuration: prefersReducedMotion ? '0ms' : '200ms' }}
            />
          </div>
        </FocusTrap>
      )}
    </nav>
  );
}
