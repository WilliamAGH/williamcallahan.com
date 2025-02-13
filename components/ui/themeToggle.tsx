"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { THEMES, type Theme } from "@/types/theme";

// Helper function to format theme name for display
const formatThemeName = (theme: Theme | undefined): string => {
  if (!theme) return formatThemeName(THEMES.SYSTEM);
  return theme.charAt(0).toUpperCase() + theme.slice(1);
};

// Helper function to get the next theme in rotation
const getNextTheme = (currentTheme: Theme | undefined): Theme => {
  switch (currentTheme) {
    case THEMES.LIGHT:
      return THEMES.DARK;
    case THEMES.DARK:
      return THEMES.SYSTEM;
    case THEMES.SYSTEM:
    default:
      return THEMES.LIGHT;
  }
};

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // After mounting, we have access to the theme
  useEffect(() => setMounted(true), []);

  // Determine if dark mode is active
  const isDark = mounted && (
    theme === THEMES.DARK || (theme === THEMES.SYSTEM && systemTheme === THEMES.DARK)
  );

  // Use theme with fallback for SSR
  const safeTheme = (mounted ? theme : THEMES.SYSTEM) as Theme;
  const currentThemeName = formatThemeName(safeTheme);
  const nextThemeName = formatThemeName(getNextTheme(safeTheme));

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setTheme(getNextTheme(safeTheme));
    }
  };

  return (
    <button
      type="button"
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800"
      onClick={() => setTheme(getNextTheme(safeTheme))}
      onKeyDown={handleKeyDown}
      aria-label={`Toggle theme (currently ${currentThemeName} theme)`}
      title={`Switch to ${nextThemeName.toLowerCase()} theme`}
    >
      <div className="relative w-5 h-5">
        <Sun
          data-testid="sun-icon"
          className={cn(
            "absolute inset-0 transition-transform",
            isDark ? "-rotate-90 scale-0" : "rotate-0 scale-100"
          )}
        />
        <Moon
          data-testid="moon-icon"
          className={cn(
            "absolute inset-0 transition-transform",
            isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0"
          )}
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
