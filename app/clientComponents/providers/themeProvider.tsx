// app/client-components/providers/themeProvider.tsx

"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { THEME_CONFIG, THEME_COLORS, THEMES, type ThemeConfig } from "@/types/theme";

/**
 * Theme Color Manager Component
 *
 * Handles updating CSS variables when theme changes
 */
function ThemeColorManager() {
  const { theme, systemTheme } = useTheme();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const isDark = theme === THEMES.DARK || (theme === THEMES.SYSTEM && systemTheme === THEMES.DARK);
    const colors = isDark ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;

    // Update CSS variables
    document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.BACKGROUND, colors.BACKGROUND);
    document.documentElement.style.setProperty(THEME_CONFIG.CSS_VARS.FOREGROUND, colors.FOREGROUND);

    console.log('[Theme] Provider updated colors:', {
      theme,
      systemTheme,
      isDark,
      background: colors.BACKGROUND,
      foreground: colors.FOREGROUND
    });
  }, [theme, systemTheme]);

  return null;
}

/**
 * Theme Provider Component
 *
 * Wraps the application with next-themes provider for theme management.
 * Uses class strategy for better SSR compatibility and performance.
 *
 * @component
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children, ...props }: ThemeConfig) {
  return (
    <NextThemesProvider
      attribute={THEME_CONFIG.ATTRIBUTE}
      defaultTheme={THEME_CONFIG.DEFAULT_THEME}
      enableSystem={THEME_CONFIG.ENABLE_SYSTEM}
      disableTransitionOnChange={THEME_CONFIG.DISABLE_TRANSITIONS}
      storageKey={THEME_CONFIG.STORAGE_KEY}
      {...props}
    >
      <ThemeColorManager />
      {children}
    </NextThemesProvider>
  );
}
