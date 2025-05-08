/**
 * Theme Provider Client Component
 *
 * Provides theme context to the application using next-themes.
 * Handles theme persistence and system preference detection.
 */

"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from "next-themes";

const THEME_TIMESTAMP_KEY = "theme-timestamp";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const isDevelopment = process.env.NODE_ENV === 'development';

function ThemeExpiryHandler({ storageKey }: { storageKey?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const actualStorageKey = storageKey || "theme";

  React.useEffect(() => {
    if (isDevelopment) {
      console.log("[ThemeDev] ThemeProvider mounted. Initial resolvedTheme:", resolvedTheme);
      console.log("[ThemeDev] ThemeExpiryHandler: Checking for explicit theme override.");
    }

    try {
      const explicitTheme = localStorage.getItem(actualStorageKey);
      const timestampStr = localStorage.getItem(THEME_TIMESTAMP_KEY);

      if (explicitTheme && (explicitTheme === 'light' || explicitTheme === 'dark') && timestampStr) {
        const timestamp = parseInt(timestampStr, 10);
        if (isDevelopment) {
          console.log(`[ThemeDev] ThemeExpiryHandler: Found explicit theme '${explicitTheme}' set at ${new Date(timestamp).toISOString()}.`);
        }
        if (Number.isFinite(timestamp) && (Date.now() - timestamp > TWENTY_FOUR_HOURS_MS)) {
          if (isDevelopment) {
            console.log("[ThemeDev] ThemeExpiryHandler: Explicit theme has EXPIRED (older than 24 hours).");
            console.log("[ThemeDev] ThemeExpiryHandler: ACTION - Reverting to 'system' theme.");
          }
          localStorage.removeItem(THEME_TIMESTAMP_KEY);
          setTheme("system");
        } else if (Number.isFinite(timestamp)) {
          if (isDevelopment) {
            console.log(`[ThemeDev] ThemeExpiryHandler: Explicit theme '${explicitTheme}' is still VALID (within 24 hours). Honoring user override.`);
          }
        } else {
          if (isDevelopment) {
            console.warn("[ThemeDev] ThemeExpiryHandler: Invalid timestamp found. Clearing timestamp.");
          }
          localStorage.removeItem(THEME_TIMESTAMP_KEY);
          // Potentially revert to system if theme is 'light'/'dark' but timestamp is bad
          if (explicitTheme === 'light' || explicitTheme === 'dark') {
             if (isDevelopment) console.log("[ThemeDev] ThemeExpiryHandler: Explicit theme found with invalid timestamp, considering reverting to system.");
             // setTheme("system"); // Consider this if issues persist
          }
        }
      } else {
        if (isDevelopment) {
          console.log("[ThemeDev] ThemeExpiryHandler: No valid explicit theme override found. Defaulting to system/next-themes behavior (system preference).");
        }
      }
    } catch (error) {
      if (isDevelopment) {
        console.error("[ThemeDev] ThemeExpiryHandler: Error accessing localStorage.", error);
      }
      // Decide if we should try to revert to system theme if localStorage fails
      // setTheme("system"); // This might be too aggressive but could prevent blank page
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTheme, actualStorageKey]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Custom Dark Reader detection logic removed.
  // Relying on next-themes enableSystem prop and color-scheme meta tag.

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      {...props}
    >
      {children}
      <ThemeExpiryHandler storageKey={props.storageKey} />
    </NextThemesProvider>
  );
}
