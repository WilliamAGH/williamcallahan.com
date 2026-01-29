/**
 * Theme Provider Client Component
 *
 * Provides theme context to the application using next-themes.
 * Handles theme persistence and system preference detection.
 */

"use client";

import { THEME_TIMESTAMP_KEY, TIME_CONSTANTS } from "@/lib/constants/client";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from "next-themes";
import * as React from "react";

const isDevelopment = process.env.NODE_ENV === "development";

function ThemeExpiryHandler({ storageKey }: { storageKey?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const actualStorageKey = storageKey || "theme";

  React.useEffect(() => {
    if (isDevelopment) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ThemeDev] ThemeProvider mounted. Initial resolvedTheme:", resolvedTheme);
        console.log("[ThemeDev] ThemeExpiryHandler: Checking for explicit theme override.");
      }
    }

    try {
      const explicitTheme = localStorage.getItem(actualStorageKey);
      const timestampStr = localStorage.getItem(THEME_TIMESTAMP_KEY);

      if (
        explicitTheme &&
        (explicitTheme === "light" || explicitTheme === "dark") &&
        timestampStr
      ) {
        const timestamp = Number.parseInt(timestampStr, 10);
        if (isDevelopment) {
          if (process.env.NODE_ENV === "development") {
            console.log(
              `[ThemeDev] ThemeExpiryHandler: Found explicit theme '${explicitTheme}' set at ${new Date(timestamp).toISOString()}.`,
            );
          }
        }
        if (
          Number.isFinite(timestamp) &&
          Date.now() - timestamp > TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS
        ) {
          if (isDevelopment) {
            if (process.env.NODE_ENV === "development") {
              console.log(
                "[ThemeDev] ThemeExpiryHandler: Explicit theme has EXPIRED (older than 24 hours).",
              );
              console.log("[ThemeDev] ThemeExpiryHandler: ACTION - Reverting to 'system' theme.");
            }
          }
          localStorage.removeItem(THEME_TIMESTAMP_KEY);
          setTheme("system");
        } else if (Number.isFinite(timestamp)) {
          if (isDevelopment) {
            if (process.env.NODE_ENV === "development") {
              console.log(
                `[ThemeDev] ThemeExpiryHandler: Explicit theme '${explicitTheme}' is still VALID (within 24 hours). Honoring user override.`,
              );
            }
          }
        } else {
          if (isDevelopment) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[ThemeDev] ThemeExpiryHandler: Invalid timestamp found. Clearing timestamp.",
              );
            }
          }
          localStorage.removeItem(THEME_TIMESTAMP_KEY);
          // Potentially revert to system if theme is 'light'/'dark' but timestamp is bad
          if (explicitTheme === "light" || explicitTheme === "dark") {
            if (isDevelopment && process.env.NODE_ENV === "development") {
              console.log(
                "[ThemeDev] ThemeExpiryHandler: Explicit theme found with invalid timestamp, considering reverting to system.",
              );
            }
            // setTheme("system"); // Consider this if issues persist
          }
        }
      } else {
        if (isDevelopment) {
          if (process.env.NODE_ENV === "development") {
            console.log(
              "[ThemeDev] ThemeExpiryHandler: No valid explicit theme override found. Defaulting to system/next-themes behavior (system preference).",
            );
          }
        }
      }
    } catch (error) {
      if (isDevelopment) {
        console.error("[ThemeDev] ThemeExpiryHandler: Error accessing localStorage.", error);
      }
      // Decide if we should try to revert to system theme if localStorage fails
      // setTheme("system"); // This might be too aggressive but could prevent blank page
    }
  }, [setTheme, actualStorageKey, resolvedTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem={true} {...props}>
      {children}
      <ThemeExpiryHandler storageKey={props.storageKey} />
    </NextThemesProvider>
  );
}

export { useTheme };
