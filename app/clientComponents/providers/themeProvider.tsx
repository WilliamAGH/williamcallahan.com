// app/client-components/providers/themeProvider.tsx

"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { THEME_CONFIG, type ThemeConfig } from "@/types/theme";

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
      {children}
    </NextThemesProvider>
  );
}
