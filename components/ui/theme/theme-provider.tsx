/**
 * Theme Provider Component
 * 
 * Provides theme context to the application using next-themes.
 * Handles theme persistence and system preference detection.
 */

"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider 
      attribute="class" 
      defaultTheme="dark" 
      enableSystem={true} 
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}