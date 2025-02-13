// app/client-components/initializers/theme.tsx

/**
 * Theme Initialization Component
 *
 * This component handles early theme initialization and system theme detection.
 * It runs before React hydration to prevent flash of incorrect theme.
 *
 * Key features:
 * - Early theme detection via inline script
 * - System theme preference monitoring
 * - Flash prevention for initial render
 * - Error handling for theme initialization
 *
 * Related files:
 * - {@link ../../../types/theme.ts Theme Types}
 * - {@link ../providers/theme-provider.tsx Theme Provider}
 *
 */

"use client";

import Script from "next/script";
import { useEffect } from "react";
import { THEMES, THEME_CONFIG } from "@/types/theme";

// Media query for system dark mode preference
const DARK_SCHEME = '(prefers-color-scheme: dark)';

/**
 * Script that runs before React hydration to set initial theme
 * This prevents flash of incorrect theme on page load
 */
const THEME_INIT_SCRIPT = `
(function() {
  try {
    // Get stored theme or fall back to system preference
    const theme = localStorage.getItem('${THEME_CONFIG.STORAGE_KEY}') || '${THEME_CONFIG.DEFAULT_THEME}';

    // Check if dark mode should be applied
    const systemPrefersDark = window.matchMedia('${DARK_SCHEME}').matches;
    const isDark = theme === '${THEMES.DARK}' ||
      (theme === '${THEMES.SYSTEM}' && systemPrefersDark);

    // Apply theme immediately to prevent flash
    document.documentElement.classList[isDark ? 'add' : 'remove']('dark');

    // Mark theme system as ready
    document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTE}', 'true');
    window.dispatchEvent(new Event('themeSystemReady'));
  } catch (e) {
    console.warn('Theme initialization failed:', e);
    document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTE}', 'error');
  }
})();
`;

/**
 * ThemeInitializer component
 * Handles theme initialization and system theme changes
 */
export function ThemeInitializer() {
  // Monitor system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_SCHEME);

    const handleChange = () => {
      const theme = localStorage.getItem(THEME_CONFIG.STORAGE_KEY) || THEME_CONFIG.DEFAULT_THEME;

      // Only update if using system theme
      if (theme === THEMES.SYSTEM) {
        const isDark = mediaQuery.matches;
        document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
      }
    };

    // Listen for system theme changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <>
      {/* Critical CSS for theme handling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root { color-scheme: light dark; }
            @media (prefers-color-scheme: dark) {
              :root:not([data-theme-ready]) { color-scheme: dark; }
            }
          `
        }}
      />
      {/* Early theme initialization */}
      <Script
        id="theme-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
    </>
  );
}
