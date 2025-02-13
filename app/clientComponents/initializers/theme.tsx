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
import { THEMES, THEME_CONFIG, THEME_COLORS, DARK_SCHEME } from "@/types/theme";

/**
 * Script that runs before React hydration to set initial theme
 * This prevents flash of incorrect theme on page load
 */
const THEME_INIT_SCRIPT = `
(function() {
  try {
    // Get stored theme or fall back to system preference
    const theme = localStorage.getItem('${THEME_CONFIG.STORAGE_KEY}') || '${THEME_CONFIG.DEFAULT_THEME}';
    console.log('[Theme] Initial theme:', theme);

    // Check if dark mode should be applied
    const systemPrefersDark = window.matchMedia('${DARK_SCHEME}').matches;
    const isDark = theme === '${THEMES.DARK}' ||
      (theme === '${THEMES.SYSTEM}' && systemPrefersDark);
    console.log('[Theme] System prefers dark:', systemPrefersDark);
    console.log('[Theme] Should apply dark mode:', isDark);

    // Set theme colors
    const colors = isDark ? ${JSON.stringify(THEME_COLORS.DARK)} : ${JSON.stringify(THEME_COLORS.LIGHT)};
    document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
    document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);

    // Set initial theme class
    document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
    console.log('[Theme] Dark class applied:', document.documentElement.classList.contains('dark'));

    // Log computed styles
    const computedStyle = getComputedStyle(document.documentElement);
    console.log('[Theme] Background color:', computedStyle.backgroundColor);
    console.log('[Theme] Color:', computedStyle.color);

    // Wait for next frame to ensure theme is applied
    requestAnimationFrame(() => {
      // Mark theme system as ready and system preference detected
      document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.READY}', 'true');
      document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED}', systemPrefersDark ? 'dark' : 'light');
      window.dispatchEvent(new Event('themeSystemReady'));
      console.log('[Theme] System ready, attributes set');

      // Log final computed styles
      const finalStyle = getComputedStyle(document.documentElement);
      console.log('[Theme] Final background:', finalStyle.backgroundColor);
      console.log('[Theme] Final color:', finalStyle.color);
    });
  } catch (e) {
    console.warn('[Theme] Initialization failed:', e);
    // Use fallback theme if initialization fails
    document.documentElement.classList.remove('dark');
    const colors = ${JSON.stringify(THEME_COLORS.LIGHT)};
    document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.BACKGROUND}', colors.BACKGROUND);
    document.documentElement.style.setProperty('${THEME_CONFIG.CSS_VARS.FOREGROUND}', colors.FOREGROUND);
    document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.READY}', 'error');
    document.documentElement.setAttribute('${THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED}', '${THEME_CONFIG.FALLBACK_THEME}');
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
      console.log('[Theme] System preference changed, current theme:', theme);

      // Only update if using system theme
      if (theme === THEMES.SYSTEM) {
        const isDark = mediaQuery.matches;
        console.log('[Theme] Updating to match system:', isDark ? 'dark' : 'light');

        // Set theme colors
        const colors = isDark ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;
        document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.BACKGROUND, colors.BACKGROUND);
        document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.FOREGROUND, colors.FOREGROUND);

        // Set theme class
        document.documentElement.classList[isDark ? 'add' : 'remove']('dark');

        // Log computed styles
        const computedStyle = getComputedStyle(document.documentElement);
        console.log('[Theme] New background:', computedStyle.backgroundColor);
        console.log('[Theme] New color:', computedStyle.color);

        // Update system preference detection attribute
        requestAnimationFrame(() => {
          document.documentElement.setAttribute(
            THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED,
            isDark ? 'dark' : 'light'
          );
          console.log('[Theme] System detection attribute updated');
        });
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
            :root {
              color-scheme: light dark;
              /* Add mobile-friendly transitions */
              ${THEME_CONFIG.CSS_VARS.TRANSITION_DURATION}: ${THEME_CONFIG.TRANSITIONS.DURATION}ms;
              ${THEME_CONFIG.CSS_VARS.TRANSITION_TIMING}: ${THEME_CONFIG.TRANSITIONS.TIMING};
              --theme-transition: background-color var(${THEME_CONFIG.CSS_VARS.TRANSITION_DURATION}) var(${THEME_CONFIG.CSS_VARS.TRANSITION_TIMING}),
                                color var(${THEME_CONFIG.CSS_VARS.TRANSITION_DURATION}) var(${THEME_CONFIG.CSS_VARS.TRANSITION_TIMING});
              /* Initial light theme colors */
              ${THEME_CONFIG.CSS_VARS.BACKGROUND}: ${THEME_COLORS.LIGHT.BACKGROUND};
              ${THEME_CONFIG.CSS_VARS.FOREGROUND}: ${THEME_COLORS.LIGHT.FOREGROUND};
            }
            @media (prefers-color-scheme: dark) {
              :root:not([${THEME_CONFIG.DATA_ATTRIBUTES.READY}]) {
                color-scheme: dark;
                ${THEME_CONFIG.CSS_VARS.BACKGROUND}: ${THEME_COLORS.DARK.BACKGROUND};
                ${THEME_CONFIG.CSS_VARS.FOREGROUND}: ${THEME_COLORS.DARK.FOREGROUND};
              }
            }
            /* Ensure smooth transitions on mobile */
            @media (hover: none) {
              :root {
                ${THEME_CONFIG.CSS_VARS.TRANSITION_DURATION}: ${THEME_CONFIG.TRANSITIONS.MOBILE_DURATION}ms;
              }
            }
          `
        }}
      />
      {/* Theme initialization */}
      <Script
        id="theme-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        onReady={() => {
          // Re-run theme check after hydration
          const mediaQuery = window.matchMedia(DARK_SCHEME);
          const theme = localStorage.getItem(THEME_CONFIG.STORAGE_KEY) || THEME_CONFIG.DEFAULT_THEME;
          console.log('[Theme] Hydration complete, current theme:', theme);

          if (theme === THEMES.SYSTEM) {
            const isDark = mediaQuery.matches;
            console.log('[Theme] System theme detected:', isDark ? 'dark' : 'light');

            // Set theme colors
            const colors = isDark ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;
            document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.BACKGROUND, colors.BACKGROUND);
            document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.FOREGROUND, colors.FOREGROUND);

            // Set theme class
            document.documentElement.classList[isDark ? 'add' : 'remove']('dark');
            console.log('[Theme] Dark class updated:', document.documentElement.classList.contains('dark'));

            // Log computed styles
            const computedStyle = getComputedStyle(document.documentElement);
            console.log('[Theme] Current background:', computedStyle.backgroundColor);
            console.log('[Theme] Current color:', computedStyle.color);

            // Update system preference detection attribute
            requestAnimationFrame(() => {
              document.documentElement.setAttribute(
                THEME_CONFIG.DATA_ATTRIBUTES.SYSTEM_DETECTED,
                isDark ? 'dark' : 'light'
              );
              // Mark theme as ready after initialization
              document.documentElement.setAttribute(THEME_CONFIG.DATA_ATTRIBUTES.READY, 'true');
              console.log('[Theme] Ready state set after system theme update');

              // Log final styles
              const finalStyle = getComputedStyle(document.documentElement);
              console.log('[Theme] Final background:', finalStyle.backgroundColor);
              console.log('[Theme] Final color:', finalStyle.color);
            });
          } else {
            // Set theme colors for non-system themes
            const colors = theme === THEMES.DARK ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;
            document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.BACKGROUND, colors.BACKGROUND);
            document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.FOREGROUND, colors.FOREGROUND);

            // Mark theme as ready immediately for non-system themes
            document.documentElement.setAttribute(THEME_CONFIG.DATA_ATTRIBUTES.READY, 'true');
            console.log('[Theme] Ready state set for non-system theme');

            // Log final styles
            const finalStyle = getComputedStyle(document.documentElement);
            console.log('[Theme] Final background:', finalStyle.backgroundColor);
            console.log('[Theme] Final color:', finalStyle.color);
          }
        }}
      />
    </>
  );
}
